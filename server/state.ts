import fs from 'fs';
import path from 'path';

export interface LineState {
  status: 'idle' | 'pending' | 'running';
  currentOrderId: string | null;
  lockedAt: string | null;
  lockedByStation: string | null;
  currentSubTaskSeq?: string;
  currentSubTaskStatus?: string | number;
}

export interface DeviceInfo {
  deviceCode: string;
  deviceName: string;
  state: string;
  deviceStatus: number; // 0: Offline, 1: Idle, 2: Fault, 4: In task, 5: Charging, 7: Upgrading
  battery: string;
  taskPath: string;
  orderId: string;
  shelfNum: string;
  devicePosition: string;
  lastUpdated: string;
  currentTaskStep?: string; // Tên bước hiện tại từ /api/rcs
  subTaskSeq?: string;      // 0, 1, 2, 3 từ /api/rcs
  subTaskStatus?: string | number; // 2: đang làm, 3: hoàn thành/đã tới điểm
  currentAlarm?: {
    type: number;
    text: string;
    desc: string;
  };
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

class SystemStateManager {
  private devices: Record<string, DeviceInfo> = {};

  private lineStates: Record<string, LineState> = {};

  private lastTimestampMs = 0;
  private logs: ActivityLog[] = [];
  private maxLogs = 50;
  private logFilePath = path.join(process.cwd(), 'amr_activity_logs.jsonl');

  public updateDevicesInfo(dataArray: any[]) {
    const now = new Date().toISOString();
    for (const item of dataArray) {
      const code = item.deviceCode;
      if (code) {
        // deviceStatus: 4 = In task. Nếu xe rảnh (1), sạc (5), lỗi (2), hoặc orderId rỗng -> không còn task
        const isDeviceInTask = Number(item.deviceStatus) === 4 && Boolean(item.orderId);
        const previous: Partial<DeviceInfo> = this.devices[code] || {};

        // Nếu xe không còn chạy task, tự động xóa subtask cũ để không bị treo trên bảng trạng thái
        const currentTaskStep = isDeviceInTask ? previous.currentTaskStep : undefined;
        const subTaskSeq = isDeviceInTask ? previous.subTaskSeq : undefined;
        const subTaskStatus = isDeviceInTask ? previous.subTaskStatus : undefined;

        this.devices[code] = {
          ...previous,
          ...item,
          currentTaskStep,
          subTaskSeq,
          subTaskStatus,
          lastUpdated: now
        };
      }
    }
  }

  public updateDeviceTaskStep(deviceCode: string, subTaskSeq: string, stepName: string, orderId: string, subTaskStatus?: string | number) {
    if (this.devices[deviceCode]) {
      this.devices[deviceCode].subTaskSeq = subTaskSeq;
      this.devices[deviceCode].subTaskStatus = subTaskStatus;
      this.devices[deviceCode].currentTaskStep = stepName;
      this.devices[deviceCode].orderId = orderId;
      this.devices[deviceCode].lastUpdated = new Date().toISOString();
    } else {
      // Khởi tạo thiết bị nếu chưa có thông tin từ deviceInfo để không bỏ sót tiến độ
      this.devices[deviceCode] = {
        deviceCode,
        deviceName: deviceCode,
        state: 'InTask',
        deviceStatus: 4,
        battery: '--',
        taskPath: '',
        orderId: orderId,
        shelfNum: '',
        devicePosition: '',
        subTaskSeq,
        subTaskStatus,
        currentTaskStep: stepName,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  public clearDeviceTask(deviceCode?: string, orderId?: string) {
    const codes = Object.keys(this.devices);
    const hasOnlyOneDevice = codes.length === 1;

    for (const code of codes) {
      const dev = this.devices[code];
      const matchDevice = deviceCode && (
        code.toLowerCase() === deviceCode.toLowerCase() ||
        dev.deviceName?.toLowerCase() === deviceCode.toLowerCase() ||
        code.includes(deviceCode) ||
        deviceCode.includes(code)
      );
      const matchOrder = orderId && (
        dev.orderId === orderId ||
        (dev.currentTaskStep && dev.currentTaskStep.includes(orderId))
      );

      // Xóa nếu khớp deviceCode, khớp orderId, hoặc toàn bộ hệ thống chỉ có 1 xe, hoặc gọi clear không truyền tham số
      if (matchDevice || matchOrder || hasOnlyOneDevice || (!deviceCode && !orderId)) {
        dev.subTaskSeq = undefined;
        dev.subTaskStatus = undefined;
        dev.currentTaskStep = undefined;
        dev.orderId = '';
        dev.lastUpdated = new Date().toISOString();
      }
    }
  }

  public updateDeviceAlarm(deviceIdentifier: string, alarmType: number, alarmText: string, alarmDesc: string) {
    // Thử tìm theo deviceCode hoặc deviceName hoặc thiết bị đang có
    let targetDeviceCode = deviceIdentifier;
    
    if (!this.devices[targetDeviceCode]) {
      // Thử tìm xem có xe nào trùng deviceName không
      for (const code in this.devices) {
        if (this.devices[code].deviceName === deviceIdentifier || code.includes(deviceIdentifier)) {
          targetDeviceCode = code;
          break;
        }
      }
    }

    if (this.devices[targetDeviceCode]) {
      // Nếu alarmType = 0 hoặc cờ nào đó báo clear, ta có thể xóa (tạm thời ghi đè)
      this.devices[targetDeviceCode].currentAlarm = {
        type: alarmType,
        text: alarmText,
        desc: alarmDesc
      };
      this.devices[targetDeviceCode].lastUpdated = new Date().toISOString();
    } else {
      console.warn(`[WARNING] Bỏ qua cảnh báo cho thiết bị không xác định: ${deviceIdentifier}`);
    }
  }

  public clearDeviceAlarm(deviceCode: string) {
    if (this.devices[deviceCode]) {
      this.devices[deviceCode].currentAlarm = undefined;
    }
  }

  public getAllDevices(): DeviceInfo[] {
    return Object.values(this.devices);
  }

  public generateUniqueOrderId(prefix: string = 'cong'): string {
    let now = Date.now();
    if (now <= this.lastTimestampMs) {
      now = this.lastTimestampMs + 1;
    }
    this.lastTimestampMs = now;

    const d = new Date(now);
    const yyyy = d.getFullYear().toString();
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const mi = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    const mmm = d.getMilliseconds().toString().padStart(3, '0');

    return `${prefix}_${yyyy}${mm}${dd}_${hh}${mi}${ss}_${mmm}`;
  }

  public getLineState(lineKey: string): LineState {
    const state = this.lineStates[lineKey];
    if (!state) {
      return { status: 'idle', currentOrderId: null, lockedAt: null, lockedByStation: null };
    }
    return { ...state };
  }

  public getAllStates(): Record<string, LineState> {
    return { ...this.lineStates };
  }

  public lockLinePending(lineKey: string, stationKey: string, orderId: string): { success: boolean; error?: string } {
    let current = this.lineStates[lineKey];
    if (!current) {
      current = {
        status: 'idle',
        currentOrderId: null,
        lockedAt: null,
        lockedByStation: null,
      };
      this.lineStates[lineKey] = current;
    }

    if (current.status !== 'idle') {
      return {
        success: false,
        error: `Line '${lineKey.toUpperCase()}' đang bận (${current.status === 'pending' ? 'chờ xác nhận' : 'chạy lệnh'} ${current.currentOrderId}). Vui lòng thử lại sau.`,
      };
    }

    this.lineStates[lineKey] = {
      status: 'pending',
      currentOrderId: orderId,
      lockedAt: new Date().toISOString(),
      lockedByStation: stationKey,
    };

    return { success: true };
  }

  public confirmLineRunning(lineKey: string): { success: boolean; error?: string } {
    const current = this.lineStates[lineKey];
    if (!current) {
      return { success: false, error: `Line '${lineKey}' không tồn tại.` };
    }

    if (current.status === 'pending') {
      current.status = 'running';
      current.currentSubTaskSeq = '0';
      current.currentSubTaskStatus = '2'; // Xe bắt đầu di chuyển tới trạm đầu
      return { success: true };
    }

    return { success: false, error: `Line '${lineKey}' không ở trạng thái chờ (pending).` };
  }

  public setLineSubTask(lineKey: string, seq?: string, status?: string | number) {
    if (this.lineStates[lineKey]) {
      if (seq !== undefined) this.lineStates[lineKey].currentSubTaskSeq = seq;
      if (status !== undefined) this.lineStates[lineKey].currentSubTaskStatus = status;
    }
  }

  public resetLine(lineKey: string): { success: boolean; message: string } {
    if (!this.lineStates[lineKey]) {
      this.lineStates[lineKey] = {
        status: 'idle',
        currentOrderId: null,
        lockedAt: null,
        lockedByStation: null,
        currentSubTaskSeq: undefined,
        currentSubTaskStatus: undefined,
      };
      return { success: true, message: `Line '${lineKey}' đã được thiết lập về trạng thái IDLE.` };
    }

    const previousOrderId = this.lineStates[lineKey].currentOrderId;
    this.lineStates[lineKey] = {
      status: 'idle',
      currentOrderId: null,
      lockedAt: null,
      lockedByStation: null,
      currentSubTaskSeq: undefined,
      currentSubTaskStatus: undefined,
    };

    // Khi reset line, xóa luôn subtask trên xe liên quan
    if (previousOrderId) {
      this.clearDeviceTask(undefined, previousOrderId);
    } else {
      if (Object.keys(this.devices).length === 1) {
        this.clearDeviceTask();
      }
    }

    this.addLog({
      type: 'RESET',
      line: lineKey,
      success: true,
      message: `Đã mở khóa (reset) ${lineKey.toUpperCase()} về trạng thái IDLE (Lệnh trước: ${previousOrderId || 'None'}).`,
    });

    return { success: true, message: `Đã mở khóa Line ${lineKey.toUpperCase()} thành công.` };
  }

  public addLog(log: Omit<ActivityLog, 'id' | 'timestamp'>) {
    const entry: ActivityLog = {
      ...log,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
    };

    // Save to memory
    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    // Persist to file
    try {
      fs.appendFileSync(this.logFilePath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err) {
      console.error('Lỗi khi ghi log ra file:', err);
    }
  }

  public getLogs(): ActivityLog[] {
    return [...this.logs];
  }
}

export const stateManager = new SystemStateManager();
