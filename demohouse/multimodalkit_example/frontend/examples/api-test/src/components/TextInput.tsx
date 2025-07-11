import { type ChangeEvent, useCallback, useEffect, useState } from "react";

export interface TextInputProps {
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}

const TextInput = ({
  value = "",
  placeholder,
  disabled = false,
  onChange,
}: TextInputProps) => {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const current = e.target.value;
      if (current !== text) {
        setText(current);
        onChange?.(current);
      }
    },
    [onChange, text]
  );
  return (
    <input
      type="text"
      className="block w-full p-2 border border-gray-300 rounded-sm"
      placeholder={placeholder}
      value={text}
      disabled={disabled}
      onChange={onInputChange}
    />
  );
};

export default TextInput;
