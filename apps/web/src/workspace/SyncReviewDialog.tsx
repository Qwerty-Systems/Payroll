import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from '@mui/material';
import { deleteCommand, listCommandsByState, requeueCommand, type SyncCommand } from '../offline/offline-db';

interface Props {
  open: boolean;
  tenantId: string;
  onClose: () => void;
  /** Called after the queue changed so the caller can refresh counts and trigger a sync. */
  onChanged: () => void;
}

const stateLabel: Record<string, string> = { conflict: 'Conflict', rejected: 'Rejected', failed: 'Will retry' };

/** Lets a user resolve offline changes that the server refused or flagged, instead of leaving them invisible. */
export default function SyncReviewDialog({ open, tenantId, onClose, onChanged }: Props) {
  const [items, setItems] = useState<SyncCommand[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setItems(await listCommandsByState(tenantId, ['conflict', 'rejected', 'failed'])); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to read offline changes.'); }
  }, [tenantId]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  async function act(task: () => Promise<unknown>) {
    setError('');
    try { await task(); await load(); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'That action could not be completed.'); }
  }

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle>Offline changes needing attention</DialogTitle>
    <DialogContent>
      <Stack spacing={1.5} sx={{ pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {!items.length && <Typography color="text.secondary">Nothing needs attention. All offline changes are synchronized or waiting to send.</Typography>}
        {items.map(item => <Alert key={item.id} severity={item.state === 'failed' ? 'warning' : 'error'} icon={false}
          action={item.state === 'failed' ? undefined : <Stack direction="row" spacing={1}>
            {item.state === 'rejected' && <Button size="small" onClick={() => void act(() => requeueCommand(item.id))}>Retry</Button>}
            <Button size="small" color="inherit" onClick={() => void act(() => deleteCommand(item.id))}>Discard</Button>
          </Stack>}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: .5 }}>
            <Chip size="small" label={stateLabel[item.state] ?? item.state} />
            <Typography variant="body2" fontWeight={700}>Attendance · {String(item.payload.workDate ?? '')}</Typography>
          </Stack>
          <Typography variant="body2">{item.lastError ?? 'No details were returned by the server.'}</Typography>
          <Typography variant="caption" color="text.secondary">Attempts: {item.attempts}{item.nextAttemptAt && item.state === 'failed' ? ` · next automatic retry ${new Date(item.nextAttemptAt).toLocaleTimeString()}` : ''}</Typography>
        </Alert>)}
        <Typography variant="caption" color="text.secondary">
          Retry sends the change again as a new submission, so only retry after fixing the cause (for example, an inactive site). Discarding removes it from this device permanently.
        </Typography>
      </Stack>
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
  </Dialog>;
}
