/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2016 Zenesis Limited, http://www.zenesis.com

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
 * John Spackman (john.spackman@zenesis.com)

 ************************************************************************ */

/**
 * This class adds Promise/A+ support to Qooxdoo, as specified at
 * https://github.com/promises-aplus/promises-spec

 * There are two ways to bind a 'this' value to callbacks - the first is to
 * append a context method to methods like then(), and the second is to specify
 * the context as the second parameter to the constructor and all callbacks will
 * be bound to that value.
 *
 * For example:
 *
 * <pre class="javascript">
 *   var promise = new qx.Promise(myAsyncFunction, this);
 *   promise.then(function() {
 *     // 'this' is preserved from the outer scope
 *   });
 *
 *   // ... is the same as: ...
 *   var promise = new qx.Promise(myAsyncFunction);
 *   promise.then(function() {
 *     // 'this' is preserved from the outer scope
 *   }, this);
 * </pre>
 *
 * If you have an existing qx.Promise and want to bind all callbacks, use the
 * bind() method - but note that it returns a new promise:
 *
 *  <pre class="javascript">
 *    var promise = someMethodThatReturnsAPromise();
 *    var boundPromise = promise.bind(this);
 *    boundPromise.then(function() {
 *      // 'this' is preserved from the outer scope
 *    }, this);
 *  </pre>
 *
 */

/**
 @ignore(process.*)
 @ignore(global.*)
 @ignore(Symbol.*)
 @ignore(chrome.*)
*/

/* global global, setImmediate, chrome, _dereq_ */
/* eslint-disable no-global-assign */
qx.Class.define("qx.Promise", {
  extend: qx.core.Object,

  /**
   * Constructor.
   *
   * The promise function is called with two parameters, functions which are to be called
   * when the promise is fulfilled or rejected respectively.  If you do not provide any
   * parameters, the promise can be externally resolved or rejected by calling the
   * <code>resolve()</code> or <code>reject()</code> methods.
   *
   * @param fn {Function} the promise function called with <code>(resolve, reject)</code>
   * @param context {Object?} optional context for all callbacks
   */
  construct(fn, context) {
    super();
    qx.Promise.__initialize();
    if (fn instanceof Promise) {
      this.__p = fn;
    } else if (fn) {
      if (context !== undefined && context !== null) {
        fn = fn.bind(context);
      }
      if (qx.core.Environment.get("qx.debug")) {
        var origFn = fn;
        var self = this;
        fn = function (resolve, reject) {
          return origFn(resolve, function (reason) {
            var args = qx.lang.Array.fromArguments(arguments);
            if (reason === undefined) {
              args.shift();
              args.unshift(qx.Promise.__DEFAULT_ERROR);
            } else if (reason && !(reason instanceof Error)) {
              self.error(
                "Calling reject with non-error object, createdAt=" +
                  JSON.stringify(self.$$createdAt || null)
              );
            }
            reject.apply(this, args);
          });
        };
      }
      this.__p = new Promise(fn);
    } else {
      this.__p = new Promise(this.__externalPromise.bind(this));
    }
    qx.core.Assert.assertTrue(!this.__p.$$qxPromise);
    this.__p.$$qxPromise = this;
    if (context !== undefined && context !== null) {
      this.bind(context);
    }
  },

  /**
   * Destructor
   */
  destruct() {
    delete this.__p.$$qxPromise;
    delete this.__p;
  },

  members: {
    /** The Promise */
    __p: null,

    /** Stores data for completing the promise externally */
    __external: null,

    /* *********************************************************************************
     *
     * Promise API methods
     *
     */

    /**
     * Returns a promise which is determined by the functions <code>onFulfilled</code>
     * and <code>onRejected</code>.
     *
     * @param onFulfilled {Function} called when the Promise is fulfilled. This function
     *  has one argument, the fulfillment value.
     * @param onRejectedOrFulfillContext {Function?} called when the Promise is rejected. This function
     *  has one argument, the rejection reason.
     * @return {qx.Promise}
     */
    then(onFulfilled, onRejectedOrFulfillContext) {
      let isContext =
        onRejectedOrFulfillContext &&
        (!qx.lang.Type.isFunction(onRejectedOrFulfillContext) ||
          qx.Class.isClass(onRejectedOrFulfillContext));
      const context = isContext ? onRejectedOrFulfillContext : this.__context;
      const p = this.__p.then(
        onFulfilled ? onFulfilled.bind(context) : onFulfilled,
        isContext
          ? () => {}
          : onRejectedOrFulfillContext
          ? onRejectedOrFulfillContext.bind(this.__context)
          : () => {}
      );
      return qx.Promise.resolve(p);
    },

    /**
     * Appends a rejection handler callback to the promise, and returns a new promise
     * resolving to the return value of the callback if it is called, or to its original
     * fulfillment value if the promise is instead fulfilled.
     *
     * @param onRejected {Function?} called when the Promise is rejected. This function
     *  has one argument, the rejection reason.
     * @return {qx.Promise} a qx.Promise is rejected if onRejected throws an error or
     *  returns a Promise which is itself rejected; otherwise, it is resolved.
     */
    catch(onRejected) {
      const p = this.__p.catch(
        onRejected ? onRejected.bind(this.__context) : onRejected
      );
      return qx.Promise.resolve(p);
    },

    /* *********************************************************************************
     *
     * Extension Promise methods
     *
     */

    /**
     * Creates a new qx.Promise with the 'this' set to a different context
     *
     * @param context {Object} the 'this' context for the new Promise
     * @return {qx.Promise} the new promise
     */
    bind(context) {
      this.__context = context;
      return this;
    },

    /**
     * Like calling <code>.then</code>, but the fulfillment value must be an array, which is flattened
     * to the formal parameters of the fulfillment handler.
     *
     * For example:
     * <pre>
     * qx.Promise.all([
     *   fs.readFileAsync("file1.txt"),
     *   fs.readFileAsync("file2.txt")
     * ]).spread(function(file1text, file2text) {
     *   if (file1text === file2text) {
     *     console.log("files are equal");
     *   }
     *   else {
     *     console.log("files are not equal");
     *   }
     * });
     * </pre>
     *
     * @param fulfilledHandler {Function} called when the Promises are fulfilled.
     * @return {qx.Promise}
     */
    spread(fulfilledHandler) {
      return this.__p.then(values => {
        new qx.Promise(() => fulfilledHandler(...values));
      });
    },

    /**
     * Appends a handler that will be called regardless of this promise's fate. The handler
     * is not allowed to modify the value of the promise
     *
     * @param handler {Function?} called when the Promise is fulfilled or rejected. This function
     *  has no arguments, but can return a promise
     * @return {qx.Promise} a qx.Promise chained from this promise
     */
    finally(onRejected, rejectContext) {
      let context = rejectContext ? rejectContext : this.__context;
      const p = this.__p.finally(
        onRejected ? onRejected.bind(context) : onRejected
      );
      return qx.Promise.resolve(p);
    },

    /**
     * Cancel this promise. Will not do anything if this promise is already settled.
     */
    cancel() {},

    /**
     * Same as {@link qx.Promise.all} except that it iterates over the value of this promise, when
     * it is fulfilled; for example, if this Promise resolves to an Iterable (eg an Array),
     * <code>.all</code> will return a Promise that waits for all promises in that Iterable to be
     * fullfilled.  The Iterable can be a mix of values and Promises
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @return {qx.Promise}
     */
    all(iterable) {
      return qx.Promise.all(iterable);
    },

    /**
     * Same as {@link qx.Promise.race} except that it iterates over the value of this promise, when
     * it is fulfilled; for example, if this Promise resolves to an Iterable (eg an Array),
     * <code>.race</code> will return a Promise that waits until the first promise in that Iterable
     * has been fullfilled.  The Iterable can be a mix of values and Promises
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @return {qx.Promise}
     */
    race(iterable) {
      return qx.Promise.race(iterable);
    },

    /**
     * Same as {@link qx.Promise.some} except that it iterates over the value of this promise, when
     * it is fulfilled.  Like <code>some</code>, with 1 as count. However, if the promise fulfills,
     * the fulfillment value is not an array of 1 but the value directly.
     *
     * @return {qx.Promise}
     */
    any(iterable) {
      return qx.Promise.any(iterable);
    },

    /**
     * Same as {@link qx.Promise.some} except that it iterates over the value of this promise, when
     * it is fulfilled; return a promise that is fulfilled as soon as count promises are fulfilled
     * in the array. The fulfillment value is an array with count values in the order they were fulfilled.
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @param count {Integer}
     * @return {qx.Promise}
     */
    some(iterable, count) {},

    /**
     * Same as {@link qx.Promise.forEach} except that it iterates over the value of this promise, when
     * it is fulfilled; iterates over the values with the given <code>iterator</code> function with the signature
     * <code>(value, index, length)</code> where <code>value</code> is the resolved value. Iteration happens
     * serially. If any promise is rejected the returned promise is rejected as well.
     *
     * Resolves to the original array unmodified, this method is meant to be used for side effects. If the iterator
     * function returns a promise or a thenable, then the result of the promise is awaited, before continuing with
     * next iteration.
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @param iterator {Function} the callback, with <code>(value, index, length)</code>
     * @return {qx.Promise}
     */
    forEach(iterator, context) {
      return this.then(values => qx.Promise.forEach(values, iterator, context));
    },

    /**
     * Same as {@link qx.Promise.filter} except that it iterates over the value of this promise, when it is fulfilled;
     * iterates over all the values into an array and filter the array to another using the given filterer function.
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @param iterator {Function} the callback, with <code>(value, index, length)</code>
     * @param options {Object?} options; can be:
     *  <code>concurrency</code> max nuber of simultaneous filters, default is <code>Infinity</code>
     * @return {qx.Promise}
     */
    filter(iterator, options) {
      return this.then(values => qx.Promise.filter(values, iterator, options));
    },

    /**
     * Same as {@link qx.Promise.map} except that it iterates over the value of this promise, when it is fulfilled;
     * iterates over all the values into an array and map the array to another using the given mapper function.
     *
     * Promises returned by the mapper function are awaited for and the returned promise doesn't fulfill
     * until all mapped promises have fulfilled as well. If any promise in the array is rejected, or
     * any promise returned by the mapper function is rejected, the returned promise is rejected as well.
     *
     * The mapper function for a given item is called as soon as possible, that is, when the promise
     * for that item's index in the input array is fulfilled. This doesn't mean that the result array
     * has items in random order, it means that .map can be used for concurrency coordination unlike
     * .all.
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @param iterator {Function} the callback, with <code>(value, index, length)</code>
     * @param options {Object?} options; can be:
     *  <code>concurrency</code> max nuber of simultaneous filters, default is <code>Infinity</code>
     * @return {qx.Promise}
     */
    map(iterator, options) {
      return this.__p.then(iterable =>
        qx.Promise.mapSeries(iterable, iterator)
      );
    },

    /**
     * Same as {@link qx.Promise.mapSeries} except that it iterates over the value of this promise, when
     * it is fulfilled; iterates over all the values into an array and iterate over the array serially,
     * in-order.
     *
     * Returns a promise for an array that contains the values returned by the iterator function in their
     * respective positions. The iterator won't be called for an item until its previous item, and the
     * promise returned by the iterator for that item are fulfilled. This results in a mapSeries kind of
     * utility but it can also be used simply as a side effect iterator similar to Array#forEach.
     *
     * If any promise in the input array is rejected or any promise returned by the iterator function is
     * rejected, the result will be rejected as well.
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @param iterator {Function} the callback, with <code>(value, index, length)</code>
     * @return {qx.Promise}
     */
    mapSeries(iterator) {
      return this.__p.then(iterable =>
        qx.Promise.mapSeries(iterable, iterator)
      );
    },

    /**
     * Same as {@link qx.Promise.reduce} except that it iterates over the value of this promise, when
     * it is fulfilled; iterates over all the values in the <code>Iterable</code> into an array and
     * reduce the array to a value using the given reducer function.
     *
     * If the reducer function returns a promise, then the result of the promise is awaited, before
     * continuing with next iteration. If any promise in the array is rejected or a promise returned
     * by the reducer function is rejected, the result is rejected as well.
     *
     * If initialValue is undefined (or a promise that resolves to undefined) and the iterable contains
     * only 1 item, the callback will not be called and the iterable's single item is returned. If the
     * iterable is empty, the callback will not be called and initialValue is returned (which may be
     * undefined).
     *
     * qx.Promise.reduce will start calling the reducer as soon as possible, this is why you might want to
     * use it over qx.Promise.all (which awaits for the entire array before you can call Array#reduce on it).
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @param reducer {Function} the callback, with <code>(value, index, length)</code>
     * @param initialValue {Object?} optional initial value
     * @return {qx.Promise}
     */
    reduce(iterable, reducer, initialValue) {
      return qx.Promise.reduce(iterable, reducer, initialValue);
    },

    /**
     * External promise handler
     */
    __externalPromise(resolve, reject) {
      this.__external = { resolve: resolve, reject: reject, complete: false };
    },

    /**
     * Returns the data stored by __externalPromise, throws an exception once processed
     */
    __getPendingExternal() {
      if (!this.__external) {
        throw new Error("Promise cannot be resolved externally");
      }
      if (this.__external.complete) {
        throw new Error("Promise has already been resolved or rejected");
      }
      this.__external.complete = true;
      return this.__external;
    },

    /**
     * Resolves an external promise
     */
    resolve(value) {
      this.__getPendingExternal().resolve(value);
    },

    /**
     * Rejects an external promise
     */
    reject(reason) {
      this.__getPendingExternal().reject(reason);
    },

    /* *********************************************************************************
     *
     * Utility methods
     *
     */

    /**
     * Returns the actual Promise implementation.
     *
     * Note that Bluebird is the current implementation, and may change without
     * notice in the future; if you use this API you accept that this is a private
     * implementation detail exposed for debugging or diagnosis purposes only.  For
     * this reason, the toPromise() method is listed as deprecated starting from the
     * first release
     * @deprecated {6.0} this API method is subject to change
     */
    toPromise() {
      return this.__p;
    }
  },

  statics: {
    /** Native Promise library; only available if the browser supports it */
    Native: null,

    /** Promise library, either the Native one or a Polyfill; reliable choice for native Promises */
    Promise: null,

    /** This is used to suppress warnings about rejections without an Error object, only used if
     * the reason is undefined
     */
    __DEFAULT_ERROR: new Error("Default Error"),

    /* *********************************************************************************
     *
     * Promise API methods
     *
     */

    /**
     * Detects whether the value is a promise.
     *
     * Note that this is not an `instanceof` check and while it may look odd to just test whether
     * there is a property called `then` which is a Function, that's the actual spec -
     * @see https://promisesaplus.com/
     *
     * The difficulty is that it also needs to have a `.finally` and `.catch` methods in order to
     * always be routinely useful; it's debatable what we can do about that here - if the calling code
     * definitely requires a promise then it can use `.resolve` to upgrade it or make sure that it is
     * a fully featured promise.  In this function, we detect that it is thenable, and then give a warning
     * if it is not catchable.
     *
     * @param {*} value
     * @returns {Boolean} true if it is a promise
     */
    isPromise(value) {
      if (!value || typeof value.then != "function") {
        return false;
      }

      if (qx.core.Environment.get("qx.debug")) {
        if (
          typeof value.finally != "function" ||
          typeof value.catch != "function"
        ) {
          qx.log.Logger.warn(
            qx.Promise,
            'Calling `isPromise` on a "thenable" instance but the object does not also support `.catch` and/or `.finally`'
          );
        }
      }

      return true;
    },

    /**
     * Returns a Promise object that is resolved with the given value. If the value is a thenable (i.e.
     * has a then method), the returned promise will "follow" that thenable, adopting its eventual
     * state; otherwise the returned promise will be fulfilled with the value. Generally, if you
     * don't know if a value is a promise or not, Promise.resolve(value) it instead and work with
     * the return value as a promise.
     *
     * @param value {Object}
     * @param context {Object?} optional context for callbacks to be bound to
     * @return {qx.Promise}
     */
    resolve(value, context) {
      var promise;
      if (value instanceof qx.Promise) {
        promise = value;
      } else {
        promise = new qx.Promise(Promise.resolve(value));
      }
      if (context !== undefined) {
        promise = promise.bind(context);
      }
      return promise;
    },

    /**
     * Returns a Promise object that is rejected with the given reason.
     * @param reason {Object?} Reason why this Promise rejected. A warning is generated if not instanceof Error. If undefined, a default Error is used.
     * @param context {Object?} optional context for callbacks to be bound to
     * @return {qx.Promise}
     */
    reject(reason, context) {
      var args = qx.lang.Array.fromArguments(arguments);
      if (reason === undefined) {
        args.shift();
        args.unshift(qx.Promise.__DEFAULT_ERROR);
      } else if (!(reason instanceof Error)) {
        qx.log.Logger.warn("Rejecting a promise with a non-Error value");
      }
      var promise = Promise.reject(args);
      return new qx.Promise(promise, context ? context : this.__context);
    },

    /**
     * Returns a promise that resolves when all of the promises in the object properties have resolved,
     * or rejects with the reason of the first passed promise that rejects.  The result of each property
     * is placed back in the object, replacing the promise.  Note that non-promise values are untouched.
     *
     * @param value {var} An object
     * @return {qx.Promise}
     */
    allOf(value) {
      function action(value) {
        var arr = [];
        var names = [];
        for (var name in value) {
          if (value.hasOwnProperty(name) && qx.Promise.isPromise(value[name])) {
            arr.push(value[name]);
            names.push(name);
          }
        }
        return qx.Promise.all(arr).then(function (arr) {
          arr.forEach(function (item, index) {
            value[names[index]] = item;
          });
          return value;
        });
      }
      return qx.Promise.isPromise(value) ? value.then(action) : action(value);
    },

    /**
     * Returns a promise that resolves when all of the promises in the iterable argument have resolved,
     * or rejects with the reason of the first passed promise that rejects.  Note that non-promise values
     * are untouched.
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @return {qx.Promise}
     */
    all(iterable) {
      if (iterable === undefined) {
        throw new Error(
          "expecting an array or an iterable object but got [object Null]"
        );
      }
      let promise;
      if (Symbol.iterator in Object(iterable)) {
        promise = Promise.all(iterable);
      } else {
        promise = Promise.all([iterable]);
      }
      return new qx.Promise(promise);
    },

    /**
     * Returns a promise that resolves or rejects as soon as one of the promises in the iterable resolves
     * or rejects, with the value or reason from that promise.
     * @param iterable {Iterable} An iterable object, such as an Array
     * @return {qx.Promise}
     */
    race(iterable) {
      return Promise.race(iterable);
    },

    /* *********************************************************************************
     *
     * Extension API methods
     *
     */

    /**
     * Like Promise.some, with 1 as count. However, if the promise fulfills, the fulfillment value is not an
     * array of 1 but the value directly.
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @return {qx.Promise}
     */
    any(iterable) {
      return Promise.any(iterable);
    },

    /**
     * Given an Iterable (arrays are Iterable), or a promise of an Iterable, which produces promises (or a mix
     * of promises and values), iterate over all the values in the Iterable into an array and return a promise
     * that is fulfilled as soon as count promises are fulfilled in the array. The fulfillment value is an
     * array with count values in the order they were fulfilled.
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @param count {Integer}
     * @return {qx.Promise}
     */
    some(iterable, count) {
      return new qx.Promise((resolve, reject) => {
        let counter = count;
        let result = [];
        for (let item of iterable) {
          qx.Promise.resolve(item).then(v => {
            result.push(v);
            counter--;
            if (!counter) {
              resolve(result);
            }
          });
        }
      });
    },

    /**
     * Iterate over an array, or a promise of an array, which contains promises (or a mix of promises and values)
     * with the given <code>iterator</code> function with the signature <code>(value, index, length)</code> where
     * <code>value</code> is the resolved value of a respective promise in the input array. Iteration happens
     * serially. If any promise in the input array is rejected the returned promise is rejected as well.
     *
     * Resolves to the original array unmodified, this method is meant to be used for side effects. If the iterator
     * function returns a promise or a thenable, then the result of the promise is awaited, before continuing with
     * next iteration.
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @param iterator {Function} the callback, with <code>(value, index, length)</code>
     * @return {qx.Promise}
     */
    forEach(iterable, iterator, context) {
      const newContext = context ? context : this.__context;
      const f = async (resolve, reject) => {
        const promise = await iterable;
        let a;
        if (iterable instanceof qx.data.Array) {
          a = promise.toArray();
        } else {
          a = iterable;
        }
        for (let i = 0; i < a.length; i++) {
          try {
            const result = await qx.Promise.resolve(a[i]);
            iterator.call(newContext, result, i, iterable.length);
          } catch (ex) {
            reject(ex);
          }
        }
        resolve();
      };
      return new qx.Promise(f.bind(newContext), newContext);
    },

    /**
     * Given an Iterable(arrays are Iterable), or a promise of an Iterable, which produces promises (or a mix of
     * promises and values), iterate over all the values in the Iterable into an array and filter the array to
     * another using the given filterer function.
     *
     * It is essentially an efficient shortcut for doing a .map and then Array#filter:
     * <pre>
     *   qx.Promise.map(valuesToBeFiltered, function(value, index, length) {
     *       return Promise.all([filterer(value, index, length), value]);
     *   }).then(function(values) {
     *       return values.filter(function(stuff) {
     *           return stuff[0] == true
     *       }).map(function(stuff) {
     *           return stuff[1];
     *       });
     *   });
     * </pre>
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @param iterator {Function} the callback, with <code>(value, index, length)</code>
     * @param options {Object?} options; can be:
     *  <code>concurrency</code> max nuber of simultaneous filters, default is <code>Infinity</code>
     * @return {qx.Promise}
     */
    filter(iterable, iterator, options) {
      const promise = qx.Promise.map(iterable, iterator, options);
      return promise.then(values => values.filter(value => value === true));
    },

    /**
     * Given an <code>Iterable</code> (arrays are <code>Iterable</code>), or a promise of an
     * <code>Iterable</code>, which produces promises (or a mix of promises and values), iterate over
     * all the values in the <code>Iterable</code> into an array and map the array to another using
     * the given mapper function.
     *
     * Promises returned by the mapper function are awaited for and the returned promise doesn't fulfill
     * until all mapped promises have fulfilled as well. If any promise in the array is rejected, or
     * any promise returned by the mapper function is rejected, the returned promise is rejected as well.
     *
     * The mapper function for a given item is called as soon as possible, that is, when the promise
     * for that item's index in the input array is fulfilled. This doesn't mean that the result array
     * has items in random order, it means that .map can be used for concurrency coordination unlike
     * .all.
     *
     * A common use of Promise.map is to replace the .push+Promise.all boilerplate:
     *
     * <pre>
     *   var promises = [];
     *   for (var i = 0; i < fileNames.length; ++i) {
     *       promises.push(fs.readFileAsync(fileNames[i]));
     *   }
     *   qx.Promise.all(promises).then(function() {
     *       console.log("done");
     *   });
     *
     *   // Using Promise.map:
     *   qx.Promise.map(fileNames, function(fileName) {
     *       // Promise.map awaits for returned promises as well.
     *       return fs.readFileAsync(fileName);
     *   }).then(function() {
     *       console.log("done");
     *   });
     * </pre>
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @param iterator {Function} the callback, with <code>(value, index, length)</code>
     * @param options {Object?} options; can be:
     *  <code>concurrency</code> max nuber of simultaneous filters, default is <code>Infinity</code>
     * @return {qx.Promise}
     */
    map(iterable, iterator, options) {
      return qx.Promise.map(iterable, iterator);
    },

    /**
     * Given an <code>Iterable</code>(arrays are <code>Iterable</code>), or a promise of an
     * <code>Iterable</code>, which produces promises (or a mix of promises and values), iterate over
     * all the values in the <code>Iterable</code> into an array and iterate over the array serially,
     * in-order.
     *
     * Returns a promise for an array that contains the values returned by the iterator function in their
     * respective positions. The iterator won't be called for an item until its previous item, and the
     * promise returned by the iterator for that item are fulfilled. This results in a mapSeries kind of
     * utility but it can also be used simply as a side effect iterator similar to Array#forEach.
     *
     * If any promise in the input array is rejected or any promise returned by the iterator function is
     * rejected, the result will be rejected as well.
     *
     * Example where .mapSeries(the instance method) is used for iterating with side effects:
     *
     * <pre>
     * // Source: http://jakearchibald.com/2014/es7-async-functions/
     * function loadStory() {
     *   return getJSON('story.json')
     *     .then(function(story) {
     *       addHtmlToPage(story.heading);
     *       return story.chapterURLs.map(getJSON);
     *     })
     *     .mapSeries(function(chapter) { addHtmlToPage(chapter.html); })
     *     .then(function() { addTextToPage("All done"); })
     *     .catch(function(err) { addTextToPage("Argh, broken: " + err.message); })
     *     .then(function() { document.querySelector('.spinner').style.display = 'none'; });
     * }
     * </pre>
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @param iterator {Function} the callback, with <code>(value, index, length)</code>
     * @return {qx.Promise}
     */
    async mapSeries(iterable, iterator) {
      const result = [];
      for (let promise of iterable) {
        const p = new qx.Promise(resolve => {
          resolve(iterator(promise));
        });
        try {
          const resolved = await p;
          result.push(resolved);
        } catch (ex) {
          return [];
        }
      }
      return result;
    },

    /**
     * Given an <code>Iterable</code> (arrays are <code>Iterable</code>), or a promise of an
     * <code>Iterable</code>, which produces promises (or a mix of promises and values), iterate
     * over all the values in the <code>Iterable</code> into an array and reduce the array to a
     * value using the given reducer function.
     *
     * If the reducer function returns a promise, then the result of the promise is awaited, before
     * continuing with next iteration. If any promise in the array is rejected or a promise returned
     * by the reducer function is rejected, the result is rejected as well.
     *
     * Read given files sequentially while summing their contents as an integer. Each file contains
     * just the text 10.
     *
     * <pre>
     *   qx.Promise.reduce(["file1.txt", "file2.txt", "file3.txt"], function(total, fileName) {
     *       return fs.readFileAsync(fileName, "utf8").then(function(contents) {
     *           return total + parseInt(contents, 10);
     *       });
     *   }, 0).then(function(total) {
     *       //Total is 30
     *   });
     * </pre>
     *
     * If initialValue is undefined (or a promise that resolves to undefined) and the iterable contains
     * only 1 item, the callback will not be called and the iterable's single item is returned. If the
     * iterable is empty, the callback will not be called and initialValue is returned (which may be
     * undefined).
     *
     * Promise.reduce will start calling the reducer as soon as possible, this is why you might want to
     * use it over Promise.all (which awaits for the entire array before you can call Array#reduce on it).
     *
     * @param iterable {Iterable} An iterable object, such as an Array
     * @param reducer {Function} the callback, with <code>(value, index, length)</code>
     * @param initialValue {Object?} optional initial value
     * @return {qx.Promise}
     */
    reduce(iterable, reducer, initialValue) {
      const promise = qx.Promise.all(iterable);
      return promise.then(values => values.reduce(reducer, initialValue));
    },

    /**
     * Returns a new function that wraps the given function fn. The new function will always return a promise that is
     * fulfilled with the original functions return values or rejected with thrown exceptions from the original function.
     * @param cb {Function}
     * @return {Function}
     */
    method(cb) {
      return (...args) =>
        new qx.Promise(resolve => resolve(cb.call(this.__context, ...args)));
    },

    /**
     * Like .all but for object properties or Maps* entries instead of iterated values. Returns a promise that
     * is fulfilled when all the properties of the object or the Map's' values** are fulfilled. The promise's
     * fulfillment value is an object or a Map with fulfillment values at respective keys to the original object
     * or a Map. If any promise in the object or Map rejects, the returned promise is rejected with the rejection
     * reason.
     *
     * If object is a trusted Promise, then it will be treated as a promise for object rather than for its
     * properties. All other objects (except Maps) are treated for their properties as is returned by
     * Object.keys - the object's own enumerable properties.
     *
     * @param input {Object} An Object
     * @return {qx.Promise}
     */
    props(input) {
      const entries = Object.entries(input);
      const promises = entries.map(
        entry =>
          new qx.Promise(async resolve => {
            const value = await entry[1];
            resolve([entry[0], value]);
          })
      );
      return qx.Promise.all(promises).then(values => {
        let result = {};
        values.forEach(entry => {
          result[entry[0]] = entry[1];
        });
        return result;
      });
    },

    /**
     * Returns a new function that wraps a function that is in node.js
     * style. The resulting function returns a promise instead of taking a
     * callback function as an argument. The promise is resolved or rejected
     * by the action of the callback function. The provided function must
     * accept a callback as its last argument, and that callback function must
     * expect its first argument to be an error if non-null. If the first
     * argument is null, the second argument (optional) will be the success
     * value.
     *
     * Example:
     *
     * Assume there is a member method in myApp.Application such as the
     * following:
     * <pre><code>
     *   issueRpc : function(method, params, callback)
     *   {
     *     ...
     *   }
     * </code></pre>
     *
     * where the signature of <code>callback</code> is:
     * <pre><code>
     *   function callback(e, result)
     * </code></pre>
     *
     * The <code>issueRpc</code>method could be converted to be called using
     * promises instead of callbacks, as shown here:
     * <pre><code>
     *   var app = qx.core.Init.getApplication();
     *   var rpc = qx.Promise.promisify(app.issueRpc, { context : app });
     *   rpc("ping", [ "hello world" ])
     *     .then(
     *       function(pongValue)
     *       {
     *         // handle result
     *       })
     *     .catch(
     *       function(e)
     *       {
     *         throw e;
     *       });
     * </code></pre>
     *
     * @param f {Function} The node.js-style function to be promisified
     *
     * @param options {Map?}
     *   The sole user option in this map is <code>context</code>, which may
     *   be specified to arrange for the provided callback function to be
     *   called in the specified context.
     *
     * @return {qx.Promise}
     */
    promisify(f) {
      return function (...args) {
        return new qx.Promise((resolve, reject) => {
          function callback(err, result) {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          }

          args.push(callback);
          f.call(this, ...args);
        });
      };
    },

    /* *********************************************************************************
     *
     * Internal API methods
     *
     */

    /** Whether one-time initialisaton has happened */
    __initialized: false,

    /**
     * One-time initializer
     */
    __initialize() {
      if (qx.Promise.__initialized) {
        return;
      }
      qx.Promise.__initialized = true;
      var isNode = typeof process !== "undefined";
      if (isNode) {
        process.on(
          "unhandledRejection",
          qx.Promise.__onUnhandledRejection.bind(this)
        );
      } else {
        qx.bom.Event.addNativeListener(
          window,
          "unhandledrejection",
          qx.Promise.__onUnhandledRejection.bind(this)
        );
      }
      // if (!qx.core.Environment.get("qx.Promise")) {
      //   qx.log.Logger.error(
      //     this,
      //     "Promises are installed and initialised but disabled from properties because qx.Promise==false; this may cause unexpected behaviour"
      //   );
      // }
    },

    /**
     * Handles unhandled errors and passes them through to Qooxdoo's global error handler
     * @param e {NativeEvent}
     */
    __onUnhandledRejection(e) {
      if (qx.lang.Type.isFunction(e.preventDefault)) {
        e.preventDefault();
      }
      var reason = null;
      if (e instanceof Error) {
        reason = e;
      } else if (e.reason instanceof Error) {
        reason = e.reason;
      } else if (e.detail && e.detail.reason instanceof Error) {
        reason = e.detail.reason;
      }
      qx.log.Logger.error(
        this,
        "Unhandled promise rejection: " +
          (reason ? reason.stack : "(not from exception)")
      );

      qx.event.GlobalError.handleError(reason);
    }
  },

  defer(statics, members) {
    statics.Promise = statics.Native = window.Promise;
    var debug = qx.core.Environment.get("qx.debug");
    qx.core.Environment.add("qx.Promise.warnings", debug);
    qx.core.Environment.add("qx.Promise.longStackTraces", false);
  }
});
