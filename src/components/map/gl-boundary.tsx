"use client";

import { Component, type ReactNode } from "react";

interface Props {
  /** Shown instead of the children once they have thrown. */
  fallback: ReactNode;
  onError?: (error: unknown) => void;
  children: ReactNode;
}

/**
 * Keeps a WebGL view (the live map, the warehouse twin) from taking the whole app
 * down with it: if it throws while rendering or in an effect (no context, a lost
 * context, a failed chunk), the screen shows `fallback` and carries on.
 */
export class GLBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("3D view failed, showing the fallback:", error);
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
