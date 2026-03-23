import { useState } from 'react';

export const useNewRequestForm = (initialState: any) => {
  const [form, setForm] = useState<any>(initialState);

  const updateField = (key: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  };

  return {
    form,
    setForm,
    updateField
  };
};
