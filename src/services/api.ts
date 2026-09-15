import { AllLinesConfig, ApiResponse, LineState, StationConfig, ActivityLog } from '../types';

let authToken: string | null = null;

export const api = {
  setToken(token: string | null) {
    authToken = token;
  },

  getHeaders(): HeadersInit {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    return headers;
  },

  async login(username: string, password: string): Promise<ApiResponse<any>> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return res.json();
  },

  async getStationConfig(line: string, station: string): Promise<ApiResponse<StationConfig>> {
    const res = await fetch(`/api/config?line=${encodeURIComponent(line)}&station=${encodeURIComponent(station)}`);
    return res.json();
  },

  async getAllConfig(): Promise<ApiResponse<AllLinesConfig>> {
    const res = await fetch('/api/config');
    return res.json();
  },

  async getLineState(line: string): Promise<ApiResponse<LineState>> {
    const res = await fetch(`/api/state?line=${encodeURIComponent(line)}`);
    return res.json();
  },

  async getAllStates(): Promise<ApiResponse<Record<string, LineState>>> {
    const res = await fetch('/api/state');
    return res.json();
  },

  async sendOrder(line: string, station: string): Promise<ApiResponse<any>> {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ line, station }),
    });
    return res.json();
  },

  async sendTrigger(line: string, station: string, triggerId: string): Promise<ApiResponse<any>> {
    const res = await fetch('/api/trigger', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ line, station, triggerId }),
    });
    return res.json();
  },

  async resetLine(line: string): Promise<ApiResponse<any>> {
    const res = await fetch('/api/line/reset', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ line }),
    });
    return res.json();
  },

  async getLogs(): Promise<ApiResponse<ActivityLog[]>> {
    const res = await fetch('/api/logs');
    return res.json();
  },

};
