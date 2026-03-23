import { describe, it, expect, vi } from 'vitest';
import { generateReport } from './reportService';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(function() {
    return {
      text: vi.fn(),
      addImage: vi.fn(),
      save: vi.fn(),
      getImageProperties: vi.fn().mockReturnValue({ width: 100, height: 100 }),
      internal: {
        pageSize: {
          getWidth: vi.fn().mockReturnValue(210),
        },
      },
    };
  }),
}));
vi.mock('html2canvas');

describe('reportService', () => {
  it('should call html2canvas and jsPDF', async () => {
    const mockCanvas = { toDataURL: vi.fn().mockReturnValue('data:image/png;base64,xxx') };
    vi.mocked(html2canvas).mockResolvedValue(mockCanvas as any);
    
    // Mock document.getElementById
    document.getElementById = vi.fn().mockReturnValue({});

    await generateReport({ companyName: 'Test' } as any, 'test-id');
    
    expect(html2canvas).toHaveBeenCalled();
    expect(jsPDF).toHaveBeenCalled();
  });
});
