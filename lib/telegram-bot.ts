// Xử lý tin nhắn gửi tới bot Telegram. Chỉ dùng trên máy chủ (route /api/telegram).
// Mọi ghi dữ liệu dùng khóa service role nên LUÔN gắn user_id lấy từ hồ sơ đã kết nối với chat.

import { aiParse } from "./ai-server.ts";
import { conflictIds, conflictsWith } from "./conflicts.ts";
import { addDays } from "./dates.ts";
import { draftFromParsed, rowsFromDraft, type Draft } from "./draft.ts";
import { draftSummary, editUrl, parseCallback, parseCommand } from "./bot.ts";
import { findMilestones, parseEvent } from "./parser.ts";
import { agendaText } from "./remind.ts";
import { admin } from "./supabase-admin.ts";
import { downloadFile, sendTelegram, tg, type InlineButton } from "./telegram.ts";
import { dateIn, safeTz, startOfDayIso, wallClockNow } from "./tz.ts";
import type { CalEvent } from "./types.ts";
import { formatVN } from "./dates.ts";

interface TgUser { id: number }
interface TgChat { id: number; type: string }
interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  document?: { file_id: string; file_name?: string; file_size?: number };
}
interface TgCallback { id: string; from: TgUser; message?: TgMessage; data?: string }
export interface Update { update_id: number; message?: TgMessage; callback_query?: TgCallback }

interface Prof { id: string; timezone: string }
type DraftPayload =
  | { kind: "event"; draft: Draft; text: string }
  | { kind: "milestones"; items: { draft: Draft; label: string; checked: boolean }[] };

const HELP =
  "Mình là bot lịch AllStack.\n\n" +
  "• Nhắn một câu như “mai 8h học nhóm Toán phòng 204”, mình đọc ra rồi bạn bấm Lưu.\n" +
  "• Gửi file Word (.docx) biên bản họp: mình lưu biên bản và liệt kê các mốc thời gian để bạn chọn đưa vào lịch.\n" +
  "• /homnay: lịch hôm nay\n• /tuan: lịch 7 ngày tới\n• /viec: việc nhóm";

async function profileByChat(chatId: number): Promise<Prof | null> {
  const { data } = await admin().from("profiles").select("id,timezone").eq("telegram_chat_id", chatId).maybeSingle();
  return data ? { id: data.id as string, timezone: safeTz(data.timezone as string) } : null;
}

async function eventsBetween(userId: string, fromIso: string, toIso: string): Promise<CalEvent[]> {
  const { data } = await admin().from("events").select("*").eq("user_id", userId).lt("start_at", toIso)
    .or(`start_at.gte.${fromIso},end_at.gte.${fromIso}`).order("start_at");
  return (data ?? []) as CalEvent[];
}

async function stash(userId: string, payload: DraftPayload): Promise<string> {
  const { data, error } = await admin().from("telegram_drafts").insert({ user_id: userId, payload }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Lấy bản nháp và XÓA luôn: ai bấm trước thì được xử lý, bấm đúp không lưu hai lần. */
async function takeDraft(id: string, userId: string): Promise<DraftPayload | null> {
  const { data } = await admin().from("telegram_drafts").delete().eq("id", id).eq("user_id", userId).select("payload");
  return (data?.[0]?.payload as DraftPayload | undefined) ?? null;
}

async function saveRows(userId: string, drafts: Draft[], tz: string): Promise<number> {
  const rows = drafts.flatMap((d) => rowsFromDraft(d, tz)).map((r) => ({ ...r, user_id: userId }));
  const { error } = await admin().from("events").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

// ---------- Kết nối ----------
async function link(chatId: number, code: string) {
  const sb = admin();
  const { data } = await sb.from("telegram_link_codes").select("user_id,expires_at").eq("code", code).maybeSingle();
  if (!data || new Date(data.expires_at as string).getTime() < Date.now()) {
    await sendTelegram(chatId, "Mã kết nối đã hết hạn hoặc không đúng. Vào web AllStack > Cài đặt > Kết nối Telegram để lấy nút mới.");
    return;
  }
  await sb.from("telegram_link_codes").delete().eq("code", code);
  await sb.from("profiles").update({ telegram_chat_id: null }).eq("telegram_chat_id", chatId); // chat này chỉ gắn một tài khoản
  const { error } = await sb.from("profiles").update({ telegram_chat_id: chatId }).eq("id", data.user_id);
  if (error) throw new Error(error.message);
  await sendTelegram(chatId, "✅ Đã kết nối Telegram với tài khoản AllStack của bạn.\n\n" + HELP);
}

// ---------- Tin nhắn ----------
async function onText(chatId: number, text: string, prof: Prof, origin: string) {
  const tz = prof.timezone;
  const now = Date.now();
  const lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
  for (const line of lines) {
    let p = parseEvent(line, wallClockNow(now, tz));
    let viaAi = false;
    if (!p.foundDate) {
      const ai = await aiParse(prof.id, line, p, dateIn(now, tz));
      if (ai) { p = ai; viaAi = true; }
    }
    const d = draftFromParsed(p);
    const first = rowsFromDraft(d, tz)[0];
    const near = await eventsBetween(prof.id, new Date(new Date(first.start_at).getTime() - 86400_000).toISOString(), new Date(new Date(first.start_at).getTime() + 86400_000).toISOString());
    const clash = conflictsWith({ ...first, cancelled: false }, near);
    const intro = viaAi ? "AI dự phòng đọc giúp, bạn kiểm tra kỹ nhé:"
      : p.confident ? "Mình đọc được như sau:"
      : !p.foundDate ? "Mình không thấy ngày nên tạm để hôm nay. Bấm “Sửa trên web” để chỉnh:"
      : "Câu này hơi lạ, kiểm tra kỹ ngày giờ nhé:";
    let msg = intro + "\n\n" + draftSummary(d);
    if (clash.length) msg += "\n\n⚠ Trùng giờ với: " + clash.map((c) => c.title).join(", ");
    const id = await stash(prof.id, { kind: "event", draft: d, text: line });
    await sendTelegram(chatId, msg, [[
      { text: "✅ Lưu", callback_data: `s:${id}` },
      { text: "✏️ Sửa trên web", url: editUrl(origin, line) },
      { text: "🗑 Bỏ", callback_data: `x:${id}` },
    ]]);
  }
}

function milestoneKeyboard(id: string, items: { label: string; checked: boolean }[]): InlineButton[][] {
  return [
    ...items.map((x, i) => [{ text: `${x.checked ? "☑" : "☐"} ${x.label}`.slice(0, 60), callback_data: `t:${id}:${i}` }]),
    [{ text: "📅 Đưa vào lịch", callback_data: `m:${id}` }, { text: "🗑 Bỏ", callback_data: `x:${id}` }],
  ];
}

async function onDocx(chatId: number, doc: NonNullable<TgMessage["document"]>, prof: Prof) {
  if (!/\.docx$/i.test(doc.file_name ?? "")) {
    await sendTelegram(chatId, "Mình chỉ đọc được file Word dạng .docx.");
    return;
  }
  if ((doc.file_size ?? 0) > 5 * 1024 * 1024) {
    await sendTelegram(chatId, "File lớn hơn 5MB, mình chưa đọc được.");
    return;
  }
  const mammoth = await import("mammoth");
  const buffer = await downloadFile(doc.file_id);
  const text = (await mammoth.extractRawText({ buffer })).value.replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    await sendTelegram(chatId, "File này không có chữ để đọc.");
    return;
  }
  const tz = prof.timezone;
  const wall = wallClockNow(Date.now(), tz);
  const head = parseEvent(text.slice(0, 200), wall);
  const date = head.foundDate ? head.date : dateIn(Date.now(), tz);
  const title = text.split("\n")[0].trim().slice(0, 80) || "Biên bản họp";
  const { error } = await admin().from("notes").insert({ user_id: prof.id, date, type: "minutes", subject: "", title, content: text });
  if (error) throw new Error(error.message);
  const ms = findMilestones(text, wall).filter((p) => !(p.date === date && /biên bản/i.test(p.title))).slice(0, 20);
  if (!ms.length) {
    await sendTelegram(chatId, `Đã lưu biên bản vào ngày ${formatVN(date)}. Mình không thấy mốc thời gian nào trong biên bản.`);
    return;
  }
  const items = ms.map((p) => ({ draft: draftFromParsed(p), label: `${formatVN(p.date).replace(/^[^,]+, /, "")}${p.start ? " " + p.start : ""}: ${p.title}`, checked: true }));
  const id = await stash(prof.id, { kind: "milestones", items });
  await sendTelegram(chatId, `Đã lưu biên bản vào ngày ${formatVN(date)}. Có ${ms.length} mốc thời gian, chạm để chọn/bỏ rồi bấm “Đưa vào lịch”:`, milestoneKeyboard(id, items));
}

async function onCommand(chatId: number, cmd: string, prof: Prof) {
  const tz = prof.timezone;
  if (cmd === "viec") return sendTelegram(chatId, "Chưa có việc nhóm.");
  if (cmd === "homnay" || cmd === "tuan") {
    const days = cmd === "homnay" ? 1 : 7;
    const today = dateIn(Date.now(), tz);
    const events = await eventsBetween(prof.id, startOfDayIso(today, tz), startOfDayIso(addDays(today, days), tz));
    const text = agendaText(today, days, events, tz, conflictIds(events));
    const title = cmd === "homnay" ? "Lịch hôm nay" : "Lịch 7 ngày tới";
    return sendTelegram(chatId, text ? `${title}:\n\n${text}` : cmd === "homnay" ? "Hôm nay bạn không có lịch 🎉" : "7 ngày tới bạn không có lịch 🎉");
  }
  return sendTelegram(chatId, HELP);
}

// ---------- Nút bấm ----------
async function editMsg(cb: TgCallback, text: string, buttons?: InlineButton[][]) {
  if (!cb.message) return;
  try {
    await tg("editMessageText", {
      chat_id: cb.message.chat.id, message_id: cb.message.message_id, text,
      reply_markup: { inline_keyboard: buttons ?? [] },
    });
  } catch (e) {
    if (!/not modified/i.test((e as Error).message)) throw e;
  }
}

async function onCallback(cb: TgCallback) {
  const answer = (text?: string) => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text } : {}) }).catch(() => {});
  const prof = cb.message ? await profileByChat(cb.message.chat.id) : null;
  const act = parseCallback(cb.data ?? "");
  if (!prof || !act) return answer("Nút này không dùng được nữa.");
  const gone = "Bản nháp đã hết hạn hoặc đã xử lý rồi.";

  if (act.act === "toggle") {
    const { data } = await admin().from("telegram_drafts").select("payload").eq("id", act.id).eq("user_id", prof.id).maybeSingle();
    const pl = data?.payload as DraftPayload | undefined;
    if (!pl || pl.kind !== "milestones" || !pl.items[act.index]) return answer(gone);
    pl.items[act.index].checked = !pl.items[act.index].checked;
    await admin().from("telegram_drafts").update({ payload: pl }).eq("id", act.id).eq("user_id", prof.id);
    await tg("editMessageReplyMarkup", {
      chat_id: cb.message!.chat.id, message_id: cb.message!.message_id,
      reply_markup: { inline_keyboard: milestoneKeyboard(act.id, pl.items) },
    }).catch(() => {});
    return answer();
  }

  const pl = await takeDraft(act.id, prof.id);
  if (!pl) {
    await editMsg(cb, cb.message?.text ?? "").catch(() => {});
    return answer(gone);
  }
  if (act.act === "drop") {
    await editMsg(cb, "Đã bỏ.");
    return answer();
  }
  if (act.act === "save" && pl.kind === "event") {
    const n = await saveRows(prof.id, [pl.draft], prof.timezone);
    await editMsg(cb, `✓ Đã lưu ${n > 1 ? n + " buổi" : ""} “${pl.draft.title}” vào ngày ${formatVN(pl.draft.date)}${pl.draft.start && !pl.draft.allDay ? " lúc " + pl.draft.start : ""}.`);
    return answer("Đã lưu");
  }
  if (act.act === "commit" && pl.kind === "milestones") {
    const chosen = pl.items.filter((x) => x.checked);
    if (chosen.length) await saveRows(prof.id, chosen.map((x) => x.draft), prof.timezone);
    await editMsg(cb, chosen.length ? `✓ Đã đưa ${chosen.length} mốc vào lịch.` : "Không đưa mốc nào vào lịch.");
    return answer("Xong");
  }
  return answer("Nút này không dùng được nữa.");
}

// ---------- Cửa vào ----------
export async function handleUpdate(u: Update, origin: string) {
  if (u.callback_query) return onCallback(u.callback_query);
  const m = u.message;
  if (!m || m.chat.type !== "private") return;
  const chatId = m.chat.id;
  const cmd = m.text ? parseCommand(m.text) : null;

  if (cmd?.cmd === "start" && cmd.arg) return link(chatId, cmd.arg.replace(/[^\w-]/g, ""));
  const prof = await profileByChat(chatId);
  if (!prof) {
    await sendTelegram(chatId, "Bạn chưa kết nối tài khoản AllStack. Vào web > Cài đặt > bấm “Kết nối Telegram”, rồi bấm Start ở đây.");
    return;
  }
  if (cmd) return onCommand(chatId, cmd.cmd, prof);
  if (m.document) return onDocx(chatId, m.document, prof);
  if (m.text) return onText(chatId, m.text, prof, origin);
}
