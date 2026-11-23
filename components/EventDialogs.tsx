"use client";

// Các hộp thoại dùng chung cho sự kiện: xem chi tiết, form thêm/sửa,
// hỏi phạm vi với sự kiện lặp, xác nhận xóa, và thanh "Hoàn tác" 10 giây.

import { useEffect, useRef, useState } from "react";
import { addDays, formatVN, isoDate, toIso } from "@/lib/dates.ts";
import { conflictsWith } from "@/lib/conflicts.ts";
import {
  draftFromEvent, previewTimes, removeEvents, rowsFromDraft, saveEdit, setCancelled, timeLabel,
  type Draft, type Scope,
} from "@/lib/events.ts";
import { store } from "@/lib/store.ts";
import { KIND_CLASS, KIND_LABEL, REMIND_OPTIONS, type CalEvent, type Kind } from "@/lib/types.ts";

export type Dialog =
  | { type: "detail"; ev: CalEvent }
  | { type: "form"; draft: Draft; ev?: CalEvent }
  | { type: "scope"; ev: CalEvent; action: "edit" | "cancel" | "restore" | "delete"; draft?: Draft }
  | { type: "confirmDelete"; ev: CalEvent; scope: Scope }
  | null;

interface Props {
  dialog: Dialog;
  setDialog: (d: Dialog) => void;
  onChanged: () => void;
}

export function EventDialogs({ dialog, setDialog, onChanged }: Props) {
  const [toast, setToast] = useState<{ text: string; undo?: () => Promise<void> } | null>(null);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (text: string, undo?: () => Promise<void>) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, undo });
    timer.current = setTimeout(() => setToast(null), 10_000);
  };

  const run = async (fn: () => Promise<void>) => {
    setErr("");
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr("Có lỗi: " + (e as Error).message);
    }
  };

  const doAction = (ev: CalEvent, action: "edit" | "cancel" | "restore" | "delete", scope: Scope, draft?: Draft) => {
    if (action === "edit" && draft) {
      return run(async () => {
        await saveEdit(ev, draft, scope);
        setDialog(null);
        showToast("Đã lưu thay đổi");
      });
    }
    if (action === "cancel" || action === "restore") {
      return run(async () => {
        await setCancelled(ev, action === "cancel", scope);
        setDialog(null);
        showToast(action === "cancel" ? "Đã hủy sự kiện, vẫn giữ trên lịch" : "Đã khôi phục sự kiện");
      });
    }
    if (action === "delete") setDialog({ type: "confirmDelete", ev, scope });
  };

  const ask = (ev: CalEvent, action: "edit" | "cancel" | "restore" | "delete", draft?: Draft) => {
    if (ev.series_id) setDialog({ type: "scope", ev, action, draft });
    else doAction(ev, action, "one", draft);
  };

  const close = () => {
    setErr("");
    setDialog(null);
  };

  return (
    <>
      {dialog && (
        <div className="overlay open" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          {dialog.type === "detail" && (
            <Detail
              ev={dialog.ev}
              err={err}
              onClose={close}
              onEdit={() => setDialog({ type: "form", draft: draftFromEvent(dialog.ev), ev: dialog.ev })}
              onCancel={() => ask(dialog.ev, dialog.ev.cancelled ? "restore" : "cancel")}
              onDelete={() => ask(dialog.ev, "delete")}
            />
          )}
          {dialog.type === "form" && (
            <EventForm
              initial={dialog.draft}
              ev={dialog.ev}
              err={err}
              onClose={close}
              onSubmit={(d) => {
                if (dialog.ev) return ask(dialog.ev, "edit", d);
                return run(async () => {
                  const rows = await store.insertEvents(rowsFromDraft(d));
                  setDialog(null);
                  showToast(rows.length > 1 ? `Đã thêm ${rows.length} buổi vào lịch` : "Đã thêm vào lịch");
                });
              }}
            />
          )}
          {dialog.type === "scope" && (
            <div className="modal">
              <h3>
                {{ edit: "Lưu thay đổi cho", cancel: "Hủy", restore: "Khôi phục", delete: "Xóa" }[dialog.action]} sự kiện lặp lại
              </h3>
              <div className="choice">
                <button className="btn" onClick={() => doAction(dialog.ev, dialog.action, "one", dialog.draft)}>Chỉ buổi này</button>
                <button className="btn" onClick={() => doAction(dialog.ev, dialog.action, "future", dialog.draft)}>Từ buổi này trở đi</button>
                <button className="btn" onClick={() => doAction(dialog.ev, dialog.action, "all", dialog.draft)}>Tất cả các buổi</button>
              </div>
              {err && <div className="err">{err}</div>}
              <div className="actions"><button className="btn" onClick={close}>Thôi</button></div>
            </div>
          )}
          {dialog.type === "confirmDelete" && (
            <div className="modal">
              <h3>Xóa hẳn khỏi lịch?</h3>
              <p>
                <b>{dialog.ev.title}</b>
                {dialog.scope === "one" ? "" : dialog.scope === "all" ? " (tất cả các buổi)" : " (từ buổi này trở đi)"}.
                Bạn có 10 giây để hoàn tác sau khi xóa. Nếu chỉ muốn giữ dấu vết, hãy chọn <b>Hủy</b> thay vì xóa.
              </p>
              {err && <div className="err">{err}</div>}
              <div className="actions">
                <button className="btn" onClick={close}>Thôi</button>
                <button
                  className="btn danger"
                  onClick={() =>
                    run(async () => {
                      const removed = await removeEvents(dialog.ev, dialog.scope);
                      setDialog(null);
                      showToast(removed.length > 1 ? `Đã xóa ${removed.length} buổi` : "Đã xóa sự kiện", async () => {
                        await store.upsertEvents(removed);
                      });
                    })
                  }
                >
                  Xóa
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {toast && (
        <div className="toast open">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              onClick={async () => {
                const u = toast.undo!;
                setToast(null);
                await run(u);
                showToast("Đã hoàn tác");
              }}
            >
              Hoàn tác
            </button>
          )}
        </div>
      )}
    </>
  );
}

function Detail(props: {
  ev: CalEvent; err: string; onClose: () => void; onEdit: () => void; onCancel: () => void; onDelete: () => void;
}) {
  const { ev } = props;
  const date = isoDate(ev.start_at);
  const endDate = ev.end_at ? isoDate(ev.end_at) : null;
  return (
    <div className="modal">
      <div className="row" style={{ marginBottom: 8 }}>
        <span className={"tag " + KIND_CLASS[ev.kind]}>{KIND_LABEL[ev.kind]}</span>
        {ev.cancelled && <span className="tag t-late">Đã hủy</span>}
        {ev.series_id && <span className="tag">↻ Lặp lại</span>}
      </div>
      <h3 className={ev.cancelled ? "cancel-txt" : ""}>{ev.title}</h3>
      <div className="f modalinfo" style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "4px 8px", fontSize: 13 }}>
        <span className="muted">Ngày</span>
        <span>{formatVN(date)}{endDate && endDate > date ? ` → ${formatVN(endDate)}` : ""}</span>
        <span className="muted">Giờ</span>
        <span>{timeLabel(ev)}</span>
        {ev.location && (<><span className="muted">Địa điểm</span><span>{ev.location}</span></>)}
        {ev.note && (<><span className="muted">Ghi chú</span><span style={{ whiteSpace: "pre-wrap" }}>{ev.note}</span></>)}
        <span className="muted">Nhắc trước</span>
        <span>{REMIND_OPTIONS.find(([v]) => v === ev.remind_minutes)?.[1] ?? `${ev.remind_minutes} phút`}{ev.cancelled ? " (đã tắt vì sự kiện bị hủy)" : ""}</span>
      </div>
      {props.err && <div className="err">{props.err}</div>}
      <div className="actions">
        <button className="btn" onClick={props.onClose}>Đóng</button>
        <button className="btn danger" onClick={props.onDelete}>Xóa</button>
        <button className="btn" onClick={props.onCancel}>{ev.cancelled ? "Khôi phục" : "Hủy"}</button>
        <button className="btn primary" onClick={props.onEdit}>Sửa</button>
      </div>
    </div>
  );
}

/** Form thêm/sửa sự kiện. Cũng dùng làm thẻ xem trước trong box chat (compact). */
export function EventForm(props: {
  initial: Draft;
  ev?: CalEvent;
  err?: string;
  compact?: boolean;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (d: Draft) => void;
}) {
  const [d, setD] = useState<Draft>(props.initial);
  const [clash, setClash] = useState<CalEvent[]>([]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  // Kiểm tra trùng lịch mỗi khi đổi ngày giờ
  useEffect(() => {
    let alive = true;
    const t = previewTimes(d);
    store
      .listEvents(toIso(d.date, null), toIso(addDays(d.endDate || d.date, 1), null))
      .then((list) => alive && setClash(conflictsWith({ ...t, id: props.ev?.id }, list)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [d.date, d.endDate, d.start, d.end, d.allDay, props.ev?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = (
    <>
      <div className="f">
        <span>Tiêu đề</span>
        <input value={d.title} autoFocus={!props.compact} onChange={(e) => set("title", e.target.value)} placeholder="VD: Họp nhóm KTL" />
        <span>Loại</span>
        <select value={d.kind} onChange={(e) => set("kind", e.target.value as Kind)}>
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (<option key={k} value={k}>{KIND_LABEL[k]}</option>))}
        </select>
        <span>Ngày</span>
        <input type="date" value={d.date} onChange={(e) => e.target.value && set("date", e.target.value)} />
        <span>Đến ngày</span>
        <input type="date" value={d.endDate} min={d.date} onChange={(e) => set("endDate", e.target.value)} title="Để trống nếu trong ngày" />
        <span>Giờ</span>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <label className="row" style={{ whiteSpace: "nowrap", fontSize: 12.5, flexWrap: "nowrap", flexShrink: 0 }}>
            <input type="checkbox" checked={d.allDay} onChange={(e) => setD((x) => ({ ...x, allDay: e.target.checked, start: e.target.checked ? "" : x.start || "08:00" }))} /> Cả ngày
          </label>
          {!d.allDay && (
            <>
              <input type="time" value={d.start} onChange={(e) => set("start", e.target.value)} />
              <span>→</span>
              <input type="time" value={d.end} onChange={(e) => set("end", e.target.value)} title="Để trống = 1 tiếng" />
            </>
          )}
        </div>
        <span>Địa điểm</span>
        <input value={d.location} onChange={(e) => set("location", e.target.value)} />
        <span>Ghi chú</span>
        <input value={d.note} onChange={(e) => set("note", e.target.value)} />
        <span>Nhắc trước</span>
        <select value={String(d.remind)} onChange={(e) => set("remind", e.target.value === "null" ? null : Number(e.target.value))}>
          {REMIND_OPTIONS.map(([v, l]) => (<option key={String(v)} value={String(v)}>{l}</option>))}
        </select>
        {!props.ev && (
          <>
            <span>Lặp lại</span>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <select value={d.repeat} onChange={(e) => set("repeat", e.target.value as Draft["repeat"])}>
                <option value="none">Không lặp</option>
                <option value="daily">Hàng ngày</option>
                <option value="weekly">Hàng tuần</option>
              </select>
              {d.repeat !== "none" && (
                <>
                  <span style={{ whiteSpace: "nowrap" }}>đến</span>
                  <input type="date" value={d.repeatUntil} min={d.date} onChange={(e) => set("repeatUntil", e.target.value)} />
                </>
              )}
            </div>
          </>
        )}
      </div>
      {clash.length > 0 && (
        <div className="warn">
          ⚠ Trùng giờ với: {clash.map((c) => `${c.title} (${timeLabel(c)})`).join("; ")}. Vẫn lưu được.
        </div>
      )}
      {props.err && <div className="err">{props.err}</div>}
    </>
  );

  const buttons = (
    <div className="actions">
      <button className="btn" onClick={props.onClose}>{props.compact ? "Bỏ qua" : "Thôi"}</button>
      <button className="btn primary" disabled={!d.title.trim()} onClick={() => props.onSubmit(d)}>
        {props.submitLabel ?? (props.ev ? "Lưu thay đổi" : "Lưu vào lịch")}
      </button>
    </div>
  );

  if (props.compact) return <div className="preview">{body}{buttons}</div>;
  return (
    <div className="modal wide">
      <h3>{props.ev ? "Sửa sự kiện" : "Thêm sự kiện"}</h3>
      {body}
      {buttons}
    </div>
  );
}
