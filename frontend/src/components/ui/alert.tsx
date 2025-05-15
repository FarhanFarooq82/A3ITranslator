import React, { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { AlertCircle } from "lucide-react"

interface AlertProps {
    variant?: "default" | "destructive";
    className?: string;
    children?: ReactNode;
    title?: ReactNode;
    description?: ReactNode;
}

const Alert: React.FC<AlertProps> = ({
    variant = "default",
    className,
    children,
    title,
    description
}) => {
    const alertVariants = {
        default: "bg-background text-foreground",
        destructive:
            "bg-destructive text-destructive-foreground",
    };

    return (
        <div
            className={cn(
                "relative w-full rounded-md border",
                alertVariants[variant],
                className
            )}
            role="alert"
        >
            <div className="flex items-start gap-2 p-4">
                {variant === "destructive" && <AlertCircle className="h-4 w-4" />}
                {title && (
                    <h4 className={cn(
                        "font-semibold",
                        variant === "destructive" ? "text-destructive-foreground" : "text-foreground"
                    )}>
                        {title}
                    </h4>
                )}
                <div>
                  {description && (
                      <p className={cn(
                          "text-sm",
                          variant === "destructive" ? "text-destructive-foreground" : "text-muted-foreground"
                      )}>
                          {description}
                      </p>
                  )}
                  {children}
                </div>
            </div>
        </div>
    );
};

const AlertTitle: React.FC<{ children?: ReactNode }> = ({ children }) => <>{children}</>;
const AlertDescription: React.FC<{ children?: ReactNode }> = ({ children }) => <>{children}</>;

export { Alert, AlertTitle, AlertDescription };
