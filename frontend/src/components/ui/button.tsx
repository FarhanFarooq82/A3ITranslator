import { forwardRef } from 'react';
import { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?:
        | 'default'
        | 'secondary'
        | 'outline'
        | 'ghost'
        | 'destructive'
        | 'link';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    className?: string;
    children?: ReactNode;
    asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            variant = 'default',
            size = 'default',
            className,
            children,
            asChild = false,
            ...props
        },
        ref
    ) => {
        const Comp = asChild ? 'button' : 'button';
        return (
            <Comp
                className={cn(
                    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
                    variant === 'default' &&
                        'bg-primary text-primary-foreground hover:bg-primary/90',
                    variant === 'secondary' &&
                        'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                    variant === 'outline' &&
                        'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
                    variant === 'ghost' &&
                        'text-foreground hover:bg-accent hover:text-accent-foreground',
                    variant === 'destructive' &&
                        'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                    variant === 'link' && 'text-primary underline-offset-4 hover:underline',
                    size === 'default' && 'px-4 py-2',
                    size === 'sm' && 'px-3 py-1.5',
                    size === 'lg' && 'px-6 py-3',
                    size === 'icon' && 'h-9 w-9 p-0',
                    className
                )}
                ref={ref}
                {...props}
            >
                {children}
            </Comp>
        );
    }
);
Button.displayName = 'Button';

export { Button };
