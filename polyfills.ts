// polyfills.ts

if (!Array.prototype.findLast) {
  Array.prototype.findLast = function <T>(
    predicate: (value: T, index: number, obj: T[]) => boolean,
    thisArg?: any
  ): T | undefined {
    if (this == null) {
      throw new TypeError('Array.prototype.findLast called on null or undefined');
    }
    if (typeof predicate !== 'function') {
      throw new TypeError('predicate must be a function');
    }

    const list = Object(this) as T[];
    const length = list.length >>> 0;

    for (let i = length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, list[i], i, list)) {
        return list[i];
      }
    }

    return undefined;
  };
}

console.log('[PickemApp] ✅ Polyfills loaded');
