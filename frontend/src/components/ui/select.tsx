import React, { forwardRef } from 'react';
import SelectPrimitive from 'react-select';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface SelectProps {
    value: { value: string; label: string } | null;
    onValueChange?: (value: string) => void;
    options: { value: string; label: string }[];
    className?: string;
    isDisabled?: boolean;
}

const Select = forwardRef<HTMLDivElement, SelectProps>(
    ({ value, onValueChange, options, className, isDisabled, ...props }, ref) => {
        return (
            <div ref={ref} className={cn('relative', className)}>
                <SelectPrimitive
                    value={value} // Pass the selected option directly
                    onChange={(selected) => {
                        if (selected && onValueChange) {
                            onValueChange(selected.value); // Pass the selected value to the parent
                        }
                    }}
                    options={options} // Pass the options array
                    classNamePrefix="react-select"
                    isSearchable={false}
                    isDisabled={isDisabled}
                    styles={{
                        control: (baseStyles, state) => ({
                            ...baseStyles,
                            display: 'flex',
                            alignItems: 'center',
                            height: '2.25rem',
                            padding: '0.5rem',
                            borderWidth: '1px',
                            borderRadius: '0.375rem',
                            borderColor: state.isFocused ? '#2563eb' : '#d1d5db',
                            backgroundColor: 'white',
                            boxShadow: state.isFocused
                                ? '0 0 0 2px rgba(37, 99, 235, 0.25)'
                                : '0 1px 2px rgba(0, 0, 0, 0.05)',
                            '&:hover': {
                                borderColor: state.isFocused ? '#2563eb' : '#d1d5db',
                            },
                            ...(isDisabled
                                ? {
                                      backgroundColor: '#f9fafb',
                                      opacity: '0.5',
                                      cursor: 'not-allowed',
                                  }
                                : {}),
                            outline: 'none',
                        }),
                        singleValue: (baseStyles) => ({
                            ...baseStyles,
                            color: '#4b5563',
                        }),
                        placeholder: (baseStyles) => ({
                            ...baseStyles,
                            color: '#9ca3af',
                        }),
                        dropdownIndicator: (baseStyles, state) => ({
                            ...baseStyles,
                            color: '#6b7280',
                            transform: state.isFocused ? 'rotate(180deg)' : 'rotate(0deg)',
                        }),
                        menu: (baseStyles) => ({
                            ...baseStyles,
                            backgroundColor: 'white',
                            borderRadius: '0.375rem',
                            boxShadow:
                                '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                            zIndex: 20,
                        }),
                        option: (baseStyles, state) => ({
                            ...baseStyles,
                            color: state.isSelected ? '#fff' : '#4b5563',
                            backgroundColor: state.isSelected
                                ? '#2563eb'
                                : state.isFocused
                                ? '#f0f9ff'
                                : 'white',
                            cursor: 'pointer',
                        }),
                    }}
                    {...props}
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500">
                    <ChevronDown className="h-5 w-5" />
                </div>
            </div>
        );
    }
);
Select.displayName = 'Select';

const SelectTrigger = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ className, children, ...props }, ref) => (
        <button
            ref={ref}
            className={cn(
                "flex items-center justify-between w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                className
            )}
            {...props}
        >
            {children}
        </button>
    )
);
SelectTrigger.displayName = 'SelectTrigger';

const SelectValue = forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
    ({ className, children, ...props }, ref) => (
        <span
            ref={ref}
            className={cn("text-sm", className)}
            {...props}
        >
            {children}
        </span>
    )
);
SelectValue.displayName = 'SelectValue';

const SelectContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, children, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                "relative z-10 w-full rounded-md border bg-popover text-popover-foreground shadow-md",
                className
            )}
            {...props}
        >
            {children}
        </div>
    )
);
SelectContent.displayName = 'SelectContent';

const SelectItem = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, children, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                "px-2 py-1.5 text-sm",
                className
            )}
            {...props}
        >
            {children}
        </div>
    )
);

SelectItem.displayName = 'SelectItem';

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
