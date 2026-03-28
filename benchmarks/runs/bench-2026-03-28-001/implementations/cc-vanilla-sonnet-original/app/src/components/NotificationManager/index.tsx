import { useNotifications } from '../../hooks/useNotifications';

export default function NotificationManager() {
  // Side-effect only component — no rendered output
  useNotifications();
  return null;
}
