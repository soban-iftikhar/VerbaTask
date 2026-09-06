import { forwardRef } from 'react';

/**
 * Stripe-inspired input field with explicit label, helper text, and error handling.
 */
export const Input = forwardRef(function Input(

 {
 label,
 id,
 error,
 helperText,
 type = 'text',
 leftIcon,
 rightIcon,
 className = '',
 containerClassName = '',
 required,
 ...props
 },
 ref
) {
 const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

 return (
 <div className={`flex flex-col gap-1.5 text-left ${containerClassName || 'w-full'}`}>
 {label && (
 <label
 htmlFor={inputId}
 className="text-xs font-medium text-ink-secondary flex items-center gap-1"
 >
 <span>{label}</span>
 {required && <span className="text-ruby">*</span>}
 </label>
 )}

 <div className="relative flex items-center">
 {leftIcon && (
 <span className="absolute left-3 text-ink-mute pointer-events-none flex items-center justify-center">
 {leftIcon}
 </span>
 )}

 <input
 ref={ref}
 id={inputId}
 type={type}
 required={required}
 className={`w-full bg-canvas text-ink text-[15px] rounded-sm border transition-all duration-150 placeholder:text-ink-mute/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 disabled:bg-canvas-soft h-10 ${
 leftIcon ? 'pl-9' : 'pl-3'
 } ${rightIcon ? 'pr-9' : 'pr-3'} ${
 error ? 'border-ruby focus:border-ruby focus:ring-ruby/20' : 'border-hairline-input'
 } ${className}`}
 {...props}
 />

 {rightIcon && (
 <span className="absolute right-3 text-ink-mute flex items-center justify-center">
 {rightIcon}
 </span>
 )}
 </div>

 {error ? (
 <p className="text-xs text-ruby font-medium mt-0.5 animate-fadeIn">{error}</p>
 ) : helperText ? (
 <p className="text-xs text-ink-mute mt-0.5">{helperText}</p>
 ) : null}
 </div>
 );
});
