export interface User {
  username: string;
  permissions: string[];
  token: string;
}

export interface StationTrigger {
  id: string;
  name: string;
  triggerStation: string;
}

export interface StationConfig {
  lineKey: string;
  stationKey: string;
  lineName: string;
  stationName: string;
  stationCode: string;
  orderLabel: string;
  taskPath: string;
  triggers: StationTrigger[];
}

export interface LineState {
  line: string;
  status: 'idle' | 'pending' | 'running';
  currentOrderId: string | null;
  lockedAt: string | null;
  lockedByStation: string | null;
}

export interface AllLinesConfig {
  lines: Array<{
    key: string;
    name: string;
    orderLabel: string;
    taskPath: string;
    stations: Array<{
      key: string;
      code: string;
      name: string;
      triggers: StationTrigger[];
      url: string;
    }>;
  }>;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  type: 'ORDER' | 'TRIGGER' | 'RESET' | 'ERROR';
  line: string;
  station?: string;
  orderId?: string;
  payload?: any;
  response?: any;
  success: boolean;
  message: string;
  durationMs?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  errorCode?: string;
  message?: string;
  orderId?: string;
  currentStation?: string;
  durationMs?: number;
}
