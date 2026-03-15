import { DebugPipe } from '@/app/components/pipes/debug.pipe';

describe('DebugPipe', () => {
  it('create an instance', () => {
    const pipe = new DebugPipe();
    expect(pipe).toBeTruthy();
  });
});
