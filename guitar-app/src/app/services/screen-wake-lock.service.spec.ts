import { TestBed } from '@angular/core/testing';
import { ScreenWakeLockService } from './screen-wake-lock.service';

describe('ScreenWakeLockService', () => {
  let service: ScreenWakeLockService;
  let mockWakeLock: any;

  beforeEach(() => {
    // Mock the WakeLock API
    mockWakeLock = {
      released: false,
      release: jest.fn().mockResolvedValue(undefined),
      addEventListener: jest.fn()
    };

    // Mock navigator.wakeLock
    Object.defineProperty(navigator, 'wakeLock', {
      writable: true,
      configurable: true,
      value: {
        request: jest.fn().mockResolvedValue(mockWakeLock)
      }
    });

    TestBed.configureTestingModule({});
    service = TestBed.inject(ScreenWakeLockService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should detect if wake lock is supported', () => {
    expect(service.isWakeLockSupported()).toBe(true);
  });

  it('should request wake lock successfully', async () => {
    const result = await service.requestWakeLock();
    expect(result).toBe(true);
    expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen');
  });

  it('should detect active wake lock', async () => {
    await service.requestWakeLock();
    expect(service.isWakeLockActive()).toBe(true);
  });

  it('should release wake lock', async () => {
    await service.requestWakeLock();
    await service.releaseWakeLock();
    expect(mockWakeLock.release).toHaveBeenCalled();
    expect(service.isWakeLockActive()).toBe(false);
  });

  it('should toggle wake lock on', async () => {
    const result = await service.toggleWakeLock();
    expect(result).toBe(true);
    expect(service.isWakeLockActive()).toBe(true);
  });

  it('should toggle wake lock off', async () => {
    await service.requestWakeLock();
    const result = await service.toggleWakeLock();
    expect(result).toBe(false);
    expect(service.isWakeLockActive()).toBe(false);
  });

  it('should handle unsupported wake lock API', async () => {
    // Save the original wakeLock
    const originalWakeLock = (navigator as any).wakeLock;
    
    // Delete wakeLock from navigator
    delete (navigator as any).wakeLock;

    const newService = new ScreenWakeLockService();
    expect(newService.isWakeLockSupported()).toBe(false);
    const result = await newService.requestWakeLock();
    expect(result).toBe(false);
    
    // Restore original wakeLock
    if (originalWakeLock !== undefined) {
      (navigator as any).wakeLock = originalWakeLock;
    }
  });
});
