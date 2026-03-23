import React from 'react';
import { Input } from './ui/Input';

interface StreetInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  // Add any specific props if needed
}

export const StreetInput: React.FC<StreetInputProps> = (props) => {
  return (
    <Input 
      {...props} 
      list="street-names" 
    />
  );
};
