export const debounce = <F extends (...args: any) => any>(func: F, wait: number, immediate?: boolean): F => {
    let timeout;
    return (function () {
        console.log('debounce');
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
 * Return true if the `target` is contained in `container`
 */
export const contains = (container: HTMLElement, target: HTMLElement) => {
    if (target === container) return true;
    if (target === document.body) return false;
    return contains(target, target.parentElement);
}

/**
 * Converts Pixels to REMs
 */
export const toPx = (rem: number) => rem * parseFloat(getComputedStyle(document.documentElement).fontSize);