import fs from 'fs';
import path from 'path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface OrderLogContext {
  orderId?: string;
  line?: string;
  station?: string;
  user?: string;
  ip?: string;
  targetUrl?: string;
  payload?: any;
  durationMs?: number;
  httpStatus?: number;
  response?: any;
  error?: string;
  action?: string;
  notice?: string;
  [key: string]: any;
}

class ControlLogger {
  private logDir = path.join(process.cwd(), 'logs');

  constructor() {
    this.ensureLogDir();
  }

  private ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (err) {
      console.error('Không thể tạo thư mục logs:', err);
    }
  }

  private getLogFilePath(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const fileName = `amr-control-${yyyy}-${mm}-${dd}.log`;
    return path.join(this.logDir, fileName);
  }

  private formatTimestamp(date: Date = new Date()): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    const mmm = String(date.getMilliseconds()).padStart(3, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${mmm}`;
  }

  public writeLog(level: LogLevel, category: string, ctx: OrderLogContext) {
    const timestamp = this.formatTimestamp();
    const orderTag = ctx.orderId ? ` [OrderId: ${ctx.orderId}]` : '';

    const lines: string[] = [];
    lines.push(`================================================================================`);
    lines.push(`[${timestamp}] [${level}] [${category}]${orderTag}`);

    // Context details
    const metaParts: string[] = [];
    if (ctx.user) metaParts.push(`User: ${ctx.user}`);
    if (ctx.ip) metaParts.push(`IP: ${ctx.ip}`);
    if (ctx.line) metaParts.push(`Line: ${ctx.line.toUpperCase()}`);
    if (ctx.station) metaParts.push(`Station: ${ctx.station}`);
    if (ctx.triggerPoint) metaParts.push(`Point: ${ctx.triggerPoint}`);
    if (ctx.deviceCode) metaParts.push(`Device: ${ctx.deviceCode}`);
    if (metaParts.length > 0) {
      lines.push(`  Context: ${metaParts.join(' | ')}`);
    }

    if (ctx.targetUrl) {
      lines.push(`  Target URL: ${ctx.targetUrl}`);
    }

    if (ctx.payload !== undefined) {
      const payloadStr = typeof ctx.payload === 'object' ? JSON.stringify(ctx.payload) : String(ctx.payload);
      lines.push(`  Payload: ${payloadStr}`);
    }

    if (ctx.durationMs !== undefined || ctx.httpStatus !== undefined) {
      const statusText = ctx.httpStatus ? `HTTP ${ctx.httpStatus}` : 'No HTTP status';
      const durationText = ctx.durationMs !== undefined ? `${ctx.durationMs}ms` : '';
      lines.push(`  Network: ${statusText} (Latency: ${durationText})`);
    }

    if (ctx.response !== undefined) {
      const resStr = typeof ctx.response === 'object' ? JSON.stringify(ctx.response) : String(ctx.response);
      lines.push(`  Response: ${resStr}`);
    }

    if (ctx.error) {
      lines.push(`  Error: ${ctx.error}`);
    }

    if (ctx.notice) {
      lines.push(`  Notice: ${ctx.notice}`);
    }

    if (ctx.action) {
      lines.push(`  Action: ${ctx.action}`);
    }

    lines.push(`================================================================================\n`);
    const logMessage = lines.join('\n');

    // Print to Console
    if (level === 'ERROR') {
      console.error(logMessage);
    } else if (level === 'WARN') {
      console.warn(logMessage);
    } else {
      console.log(logMessage);
    }

    // Persist to Daily Log File
    try {
      this.ensureLogDir();
      fs.appendFileSync(this.getLogFilePath(), logMessage, 'utf8');
    } catch (err) {
      console.error('Lỗi khi ghi log điều khiển ra file:', err);
    }
  }

  // --- SHORTCUT METHODS FOR AMR CONTROL ---

  public orderSendSuccess(ctx: OrderLogContext) {
    this.writeLog('INFO', 'ORDER_SEND_SUCCESS', {
      action: 'Gửi lệnh tới RCS thành công -> Line chuyển trạng thái RUNNING',
      ...ctx,
    });
  }

  public orderSendFailed(ctx: OrderLogContext) {
    this.writeLog('ERROR', 'ORDER_SEND_FAILED', {
      action: 'Gửi lệnh tới RCS thất bại -> Đã Rollback trạng thái Line về IDLE',
      ...ctx,
    });
  }

  public orderLockRejected(ctx: OrderLogContext) {
    this.writeLog('WARN', 'ORDER_LOCK_REJECTED', {
      action: 'Từ chối nhận lệnh do Line đang bận',
      ...ctx,
    });
  }

  public triggerSuccess(ctx: OrderLogContext) {
    this.writeLog('INFO', 'TRIGGER_SUCCESS', {
      action: 'Kích hoạt trigger thành công -> Xe tiếp tục lộ trình',
      ...ctx,
    });
  }

  public triggerRejected(ctx: OrderLogContext) {
    this.writeLog('WARN', 'TRIGGER_REJECTED', {
      action: 'RCS từ chối kích hoạt trigger',
      ...ctx,
    });
  }

  public triggerFailed(ctx: OrderLogContext) {
    this.writeLog('ERROR', 'TRIGGER_FAILED', {
      action: 'Lỗi mạng hoặc không thể gửi trigger đến RCS',
      ...ctx,
    });
  }

  public lineReset(ctx: OrderLogContext) {
    this.writeLog('WARN', 'LINE_MANUAL_RESET', {
      action: 'Admin thực hiện reset Line về trạng thái IDLE',
      ...ctx,
    });
  }

  public rcsOrderProgress(ctx: OrderLogContext) {
    this.writeLog('INFO', 'RCS_TASK_PROGRESS', {
      action: 'RCS webhook cập nhật tiến độ lệnh',
      ...ctx,
    });
  }

  public rcsOrderFinished(ctx: OrderLogContext) {
    this.writeLog('INFO', 'RCS_TASK_FINISHED', {
      action: 'RCS thông báo hoàn tất/hủy lệnh -> Tự động mở khóa Line và xóa task trên xe',
      ...ctx,
    });
  }

  // --- AUTH & SECURITY LOGS ---

  public authLoginSuccess(ctx: OrderLogContext) {
    this.writeLog('INFO', 'AUTH_LOGIN_SUCCESS', {
      action: 'Đăng nhập thành công',
      ...ctx,
    });
  }

  public authLoginFailed(ctx: OrderLogContext) {
    this.writeLog('WARN', 'AUTH_LOGIN_FAILED', {
      action: 'Đăng nhập thất bại (sai tên đăng nhập hoặc mật khẩu)',
      ...ctx,
    });
  }

  public authForbidden(ctx: OrderLogContext) {
    this.writeLog('WARN', 'AUTH_FORBIDDEN', {
      action: 'Từ chối quyền truy cập (Không đủ quyền hạn)',
      ...ctx,
    });
  }

  public authInvalidToken(ctx: OrderLogContext) {
    this.writeLog('WARN', 'AUTH_INVALID_TOKEN', {
      action: 'Token không hợp lệ hoặc phiên làm việc đã hết hạn',
      ...ctx,
    });
  }
}

export const controlLogger = new ControlLogger();
