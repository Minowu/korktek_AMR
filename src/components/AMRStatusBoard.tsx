import React, { useEffect, useState } from 'react';
import { Activity, Battery, AlertTriangle, PowerOff } from 'lucide-react';

const STATUS_MAP: Record<number, { text: string, color: string, icon: any }> = {
  0: { text: 'Ngoại tuyến', color: 'bg-gray-200 text-gray-500', icon: PowerOff },
  1: { text: 'Rảnh', color: 'bg-green-100 text-green-700', icon: Activity },
  2: { text: 'Lỗi', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  3: { text: 'Khởi tạo', color: 'bg-yellow-100 text-yellow-700', icon: Activity },
  4: { text: 'Làm việc', color: 'bg-blue-100 text-blue-700', icon: Activity },
  5: { text: 'Sạc', color: 'bg-green-100 text-green-700', icon: Battery },
  7: { text: 'Nâng cấp', color: 'bg-purple-100 text-purple-700', icon: Activity },
};

export default function AMRStatusBoard() {
  const [devices, setDevices] = useState<any[]>([]);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await fetch('/api/devices');
        const json = await res.json();
        if (json.success) setDevices(json.data);
      } catch (error) {
        console.error("Failed to fetch devices", error);
      }
    };

    fetchDevices();
    const interval = setInterval(fetchDevices, 2000); // Polling mỗi 2 giây
    return () => clearInterval(interval);
  }, []);

  if (devices.length === 0) {
    return (
      <div className="p-4 text-xs py-2 text-gray-500 text-center border border-dashed rounded-lg">
        Chưa có dữ liệu AMR nào.
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-3 max-h-[220px] overflow-y-auto shadow-inner">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Trạng thái AMR</span>
        <span className="text-sm font-medium text-slate-500">{devices.length} xe</span>
      </div>
      <div className="space-y-2">
        {devices.map(device => {
          const statusConfig = STATUS_MAP[device.deviceStatus] || STATUS_MAP[0];
          const Icon = statusConfig.icon;
          const isBusy = device.deviceStatus === 4 || !!device.currentTaskStep;

          return (
            <div key={device.deviceCode} className="flex items-center justify-between bg-white border border-slate-100 p-3 rounded-lg shadow-sm">
              <div className="flex flex-col gap-1 max-w-[65%]">
                <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <span className="truncate">{device.deviceName || device.deviceCode}</span>
                  <span className="text-xs text-slate-500 font-medium flex items-center gap-1"><Battery size={14} /> {device.battery}%</span>
                </div>
                {device.currentAlarm && device.currentAlarm.type !== 0 ? (
                  <div className="text-xs text-red-600 font-bold mt-0.5 truncate flex items-center gap-1" title={device.currentAlarm.desc}>
                    <AlertTriangle size={12} /> LỖI: {device.currentAlarm.text}
                  </div>
                ) : isBusy && device.currentTaskStep ? (
                  <div className="text-xs text-blue-600 truncate font-medium mt-0.5" title={device.currentTaskStep}>
                    {device.currentTaskStep}
                  </div>
                ) : null}
              </div>

              <span className={`px-2 py-1 rounded-md flex items-center gap-1.5 shrink-0 ${statusConfig.color} bg-opacity-70 text-xs font-semibold shadow-sm`}>
                <Icon size={14} />
                {statusConfig.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
