import { describe, expect, it } from 'vitest';
import { deviceKind, deviceLabel, forDevice } from './device';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID_TAB = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const WIN_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0';

describe('device', () => {
  it('tells phones, tablets and computers apart', () => {
    expect(deviceKind({ userAgent: IPHONE })).toBe('phone');
    expect(deviceKind({ userAgent: IPAD, maxTouchPoints: 5 })).toBe('tablet');
    expect(deviceKind({ userAgent: IPAD, maxTouchPoints: 0 })).toBe('computer'); // a real Mac
    expect(deviceKind({ userAgent: ANDROID_TAB })).toBe('tablet');
    expect(deviceKind({ userAgent: WIN_EDGE })).toBe('computer');
    expect(deviceLabel({ userAgent: IPHONE })).toBe('iPhone · Safari');
    expect(deviceLabel({ userAgent: WIN_EDGE })).toBe('Windows · Edge');
  });

  it('says phone or tablet instead of computer, keeping general statements', () => {
    expect(forDevice('Gardés sur cet ordinateur. Cet ordinateur est prêt.', 'fr', 'phone')).toBe('Gardés sur ce téléphone. Ce téléphone est prêt.');
    expect(forDevice('Suggéré pour votre ordinateur', 'fr', 'tablet')).toBe('Suggéré pour votre tablette');
    expect(forDevice('Stays on this computer. Your computer is ready.', 'en', 'phone')).toBe('Stays on this phone. Your phone is ready.');
    expect(forDevice('Works on any computer.', 'en', 'phone')).toBe('Works on any computer.');
    expect(forDevice('Stays on this computer.', 'en', 'computer')).toBe('Stays on this computer.');
  });
});
