// src/utils/catchError.js
export const catchError = (callback) => {
  if (typeof callback !== "function") {
    throw new TypeError("catchError expects a function");
  }
  return (req, res, next) => {
    try {
      const result = callback(req, res, next);
      Promise.resolve(result).catch(next);
    } catch (error) {
      next(error);
    }
  };
};
