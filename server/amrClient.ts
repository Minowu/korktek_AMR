import fs from 'fs';
import path from 'path';

export interface AmrConfig {
  amrSystem: {
    baseUrl: string;
    orderPath: string;
    triggerPath: string;
    timeoutMs: number;
  };
  orderCommon: {
    modelProcessCode: string;
    priority: number;
    fromSystem: string;
  };
  lines: Record<
    string,
    {
      name: string;
      orderLabel: string;
      taskPath: string;
      stations: Record<
        string,
        {
          code: string;
          name: string;
          triggers?: Array<{
            id: string;
            name: string;
            triggerStation: string;
            color?: string;
            icon?: string;
            modalTitle?: string;
            modalMessage?: string;
            modalVariant?: 'primary' | 'warning' | 'danger';
            requiredSubTaskSeq?: string[];
          }>;
        }
      >;
    }
  >;
}

export interface AmrOrderPayload {
  modelProcessCode: string;
  priority: number;
  fromSystem: string;
  orderId: string;
  taskOrderDetail: Array<{
    taskPath: string;
  }>;
}

export interface AmrTriggerPayload {
  currentStation: string;
}

class AmrClientService {
  private configPath = path.join(process.cwd(), 'server', 'config.json');
  private config!: AmrConfig;

  constructor() {
    this.loadConfig();
  }

  public loadConfig(): AmrConfig {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(data);
      return this.config;
    } catch (err) {
      console.error('Lỗi khi đọc file cấu hình config.json:', err);
      throw new Error('Không thể đọc file cấu hình server/config.json');
    }
  }

  public getConfig(): AmrConfig {
    if (!this.config) {
      this.loadConfig();
    }
    return this.config;
  }
  /**
   * Send Order to AMR System
   */
  public async sendOrder(payload: AmrOrderPayload): Promise<{
    success: boolean;
    data?: any;
    error?: string;
    httpStatus?: number;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const { baseUrl, orderPath, timeoutMs } = this.config.amrSystem;

    // Real HTTP call to AMR System
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs || 5000);
    const targetUrl = `${baseUrl.replace(/\/+$/, '')}${orderPath}`;

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept-language': 'en-US',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      const text = await response.text();
      console.log(`\n--- [sendOrder] GỬI LỆNH ĐẾN RCS ---`);
      console.log(`URL: ${targetUrl}`);
      console.log(`Payload: ${JSON.stringify(payload)}`)
      console.log(`HTTP Status: ${response.status} | response.ok = ${response.ok}`);
      console.log(`Phản hồi (RAW Text):`, text);
      console.log(`------------------------------------\n`);

      let resJson: any = null;
      try {
        resJson = JSON.parse(text);
      } catch {
        resJson = { raw: text };
      }

      if (!response.ok) {
        return {
          success: false,
          error: `AMR System lỗi khi cố gửi đến RCS${response.status}: ${text}`,
          httpStatus: response.status,
          durationMs,
        };
      }

      if (resJson && resJson.code != 1000) {
        return {
          success: false,
          error: `AMR System từ chối lệnh (code: ${resJson.code}): ${resJson.desc || resJson.msg || JSON.stringify(resJson)}`,
          httpStatus: response.status,
          durationMs,
        };
      }

      return {
        success: true,
        data: resJson,
        durationMs,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      if (err.name === 'AbortError') {
        return {
          success: false,
          error: `AMR System quá thời gian chờ (Timeout sau ${timeoutMs}ms)`,
          durationMs,
        };
      }
      return {
        success: false,
        error: `Không thể kết nối đến AMR System (${baseUrl}): ${err.message}`,
        durationMs,
      };
    }
  }

  /**
   * Send Trigger to AMR System
   */
  public async sendTrigger(payload: AmrTriggerPayload): Promise<{
    success: boolean;
    data?: any;
    error?: string;
    httpStatus?: number;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const { baseUrl, triggerPath, timeoutMs } = this.config.amrSystem;

    // Real HTTP call to AMR System
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs || 5000);
    const targetUrl = `${baseUrl.replace(/\/+$/, '')}${triggerPath}`;

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Accept-Language': 'en-US',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      const text = await response.text();

      console.log(`\n--- [sendTrigger] GỬI KÍCH HOẠT (TRIGGER) ĐẾN RCS ---`);
      console.log(`URL: ${targetUrl}`);
      console.log(`Payload: ${JSON.stringify(payload)}`);
      console.log(`HTTP Status: ${response.status} | response.ok = ${response.ok}`);
      console.log(`Phản hồi (RAW Text):`, text);
      console.log(`-------------------------------------------------------\n`);

      let resJson: any = null;
      try {
        resJson = JSON.parse(text);
      } catch {
        resJson = { raw: text };
      }

      if (!response.ok) {
        return {
          success: false,
          error: `AMR System trả mã lỗi HTTP ${response.status}: ${text}`,
          httpStatus: response.status,
          durationMs,
        };
      }

      if (resJson && resJson.code != 1000) {
        if (resJson.code == 4201) {
          return {
            success: false,
            error: 'AMR chưa đến điểm kích hoạt, xin vui lòng thử bấm lại sau',
            httpStatus: response.status,
            durationMs,
          }
        }
        return {
          success: false,
          error: `AMR từ chối lệnh Trigger (code: ${resJson.code}): ${resJson.desc || resJson.msg || JSON.stringify(resJson)}`,
          httpStatus: response.status,
          durationMs,
        };
      }

      return {
        success: true,
        data: resJson,
        durationMs,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      if (err.name === 'AbortError') {
        return {
          success: false,
          error: `Trigger quá thời gian chờ (Timeout sau ${timeoutMs}ms)`,
          durationMs,
        };
      }
      return {
        success: false,
        error: `Không thể kết nối gửi Trigger đến AMR System (${baseUrl}): ${err.message}`,
        durationMs,
      };
    }
  }
}

export const amrClient = new AmrClientService();
