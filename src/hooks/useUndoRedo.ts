import { useState, useCallback } from "react";

/**
 * 通用 undo/redo 棧——包住現有嘅 value + setter（例如 designText/setDesignText），
 * commit() 記一步低（推入 history、清空 future），undo()/redo() 喺兩條棧之間搬。
 * 跟標準做法：一有新 commit（用戶自己再改一次），舊嘅 future（重做）就會清走。
 */
export function useUndoRedo<T>(current: T, setCurrent: (v: T) => void) {
  const [history, setHistory] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);

  const commit = useCallback((next: T) => {
    setHistory((h) => [...h, current]);
    setFuture([]);
    setCurrent(next);
  }, [current, setCurrent]);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setFuture((f) => [current, ...f]);
      setCurrent(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, [current, setCurrent]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      setHistory((h) => [...h, current]);
      setCurrent(f[0]);
      return f.slice(1);
    });
  }, [current, setCurrent]);

  const reset = useCallback(() => {
    setHistory([]);
    setFuture([]);
  }, []);

  return {
    commit, undo, redo, reset,
    canUndo: history.length > 0,
    canRedo: future.length > 0,
    previous: history.length > 0 ? history[history.length - 1] : null,
  };
}
