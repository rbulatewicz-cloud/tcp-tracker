import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportGenerator } from './ReportGenerator';
import { generateReport } from '../services/reportService';

vi.mock('../services/reportService', () => ({
  generateReport: vi.fn(),
}));

describe('ReportGenerator', () => {
  it('should call generateReport on click', () => {
    render(<ReportGenerator template={{ companyName: 'Test' } as any} elementId="test-id" />);
    const button = screen.getByText('Generate PDF Report');
    fireEvent.click(button);
    expect(generateReport).toHaveBeenCalled();
  });
});
