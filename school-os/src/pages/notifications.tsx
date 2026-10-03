import { useState } from 'react';
import { Megaphone, Search } from 'lucide-react';
import { STUDENTS } from '../lib/data';
import { queueLeaveSelection } from '../lib/leave-live';
import { queueFlagSelection } from '../lib/flags-live';
import { useApp, useMyNotifications } from '../lib/store';
import { cn } from '../lib/utils';
import { Can, FieldLabel, GlassButton, GlassCard, GlassInput, GlassSelect, GlassTextarea, Modal, SectionHead, StatusBadge } from '../components/glass';

const KIND_TONE: Record<string, string> = { academic: 'neutral', attendance: 'present', fee: 'pending', event: 'active', system: 'closed', leave: 'pending', note: 'neutral', flag: 'pending' };

export function Notifications() {
  const { markRead, markAllRead, pushToast, go } = useApp();
  const notifications = useMyNotifications();
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const rows = notifications.filter((n) =>
    (kind === 'all' || n.kind === kind) &&
    (!showUnreadOnly || !n.read) &&
    (`${n.title} ${n.body}`.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="animate-fade-up mx-auto max-w-[880px] space-y-5">
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHead title="Inbox" body={`${notifications.filter((n) => !n.read).length} unread · across all channels`} />
          <div className="flex gap-2">
            <GlassButton variant="ghost" onClick={markAllRead}>Mark all read</GlassButton>
            <Can do="announce.send">
              <GlassButton variant="primary" icon={<Megaphone size={15} />} onClick={() => setComposeOpen(true)}>Announce</GlassButton>
            </Can>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <GlassInput icon={<Search size={14} />} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notifications…" className="min-w-[200px] flex-1" />
          <GlassSelect value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by type">
            <option value="all">All types</option>
            <option value="academic">Academic</option>
            <option value="attendance">Attendance</option>
            <option value="fee">Fees</option>
            <option value="event">Events</option>
            <option value="leave">Leave</option>
            <option value="note">Notes</option>
            <option value="flag">Flags</option>
            <option value="system">System</option>
          </GlassSelect>
          <button
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            className={cn(
              'h-10 cursor-pointer rounded-lg px-3.5 text-[13px] font-semibold transition-all',
              showUnreadOnly ? 'bg-periwinkle-3 text-text-primary' : 'btn-glass',
            )}
          >
            Unread only
          </button>
        </div>
      </GlassCard>

      <div className="space-y-2.5">
        {rows.length === 0 && (
          <GlassCard>
            <div className="py-8 text-center">
              <p className="font-display text-[16px] font-bold text-text-primary">All caught up</p>
              <p className="mt-1 text-[13px] text-text-secondary">No notifications match these filters.</p>
            </div>
          </GlassCard>
        )}
        {rows.map((n) => (
          <GlassCard key={n.id} hover pad className={cn('p-4! rounded-[20px]! cursor-pointer', !n.read && 'bg-periwinkle/50!')} >
            <button onClick={() => { markRead(n.id); if (n.ref.leaveId) queueLeaveSelection(n.ref.leaveId); if (n.ref.studentId || n.ref.recordId) queueFlagSelection(n.ref.studentId ?? null, n.ref.recordId ?? null); go(n.ref.route); }} className="w-full cursor-pointer text-left">
              <div className="flex flex-wrap items-center gap-2">
                {!n.read && <span className="h-2 w-2 rounded-full bg-periwinkle-3" />}
                <StatusBadge tone={KIND_TONE[n.kind]}>{n.kind}</StatusBadge>
                {n.priority === 'high' && <StatusBadge tone="overdue">priority</StatusBadge>}
                <span className="ml-auto font-mono text-[11px] text-text-secondary">{n.time}</span>
              </div>
              <p className="mt-2 text-[14.5px] font-bold text-text-primary">{n.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-text-secondary">{n.body}</p>
            </button>
          </GlassCard>
        ))}
      </div>

      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="New announcement" subtitle="Push + SMS to selected audience."
        footer={<>
          <GlassButton variant="ghost" onClick={() => setComposeOpen(false)}>Cancel</GlassButton>
          <GlassButton variant="primary" icon={<Megaphone size={15} />} onClick={() => { setComposeOpen(false); pushToast({ title: 'Announcement sent', body: `Delivered to ${STUDENTS.length} families via push and SMS.`, tone: 'success' }); }}>Send now</GlassButton>
        </>}>
        <div className="grid gap-3.5">
          <div><FieldLabel>Audience</FieldLabel><GlassSelect><option>Whole school</option><option>Grade 10 only</option><option>Grade 10-B parents</option><option>Teachers</option></GlassSelect></div>
          <div><FieldLabel>Title</FieldLabel><GlassInput placeholder="e.g. PTM rescheduled to Oct 4" /></div>
          <div><FieldLabel>Message</FieldLabel><GlassTextarea rows={4} placeholder="Write a clear, calm update…" /></div>
        </div>
      </Modal>
    </div>
  );
}
