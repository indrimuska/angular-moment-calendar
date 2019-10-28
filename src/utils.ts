/**
 * Debouncing bunches a series of sequential calls to a function into a **single call** to that function.
 * It ensures that one notification is made for an event that fires multiple times.
 */
export const debounce = <F extends (...args: any) => any>(func: F, wait: number, immediate?: boolean): F => {
    let timeout;
    return (function () {
        const context = this;
        const args = arguments;
        const later = () => {
            timeout = null;
            if (!immediate) return func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) return func.apply(context, args);
    }) as F;
};

/**
 * Throttling delays the execution of a function.
 * It **reduces** the notifications of an event that fires multiple times.
 */
export const throttle = <F extends (...args: any) => any>(func: F, wait: number): F => {
    let timeout = null;
    let previous = 0;
    return (function () {
        const context = this;
        const args = arguments;
        const now = Date.now();
        const remaining = wait - (now - previous);
        if (remaining <= 0 || remaining > wait) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            previous = now;
            return func.apply(context, args);
        }
    }) as F;
};

/**
 * Return `true` if the `target` is contained in `container`
 */
export const contains = (container: Element, target: Element) => {
    if (target === container) return true;
    if (target === document.body) return false;
    return contains(container, target.parentElement);
}

/**
 * Converts Pixels to REMs
 */
export const toPx = (rem: number) => rem * parseFloat(getComputedStyle(document.documentElement).fontSize);