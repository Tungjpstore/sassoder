"use client";

import type { ReactNode } from "react";
import { CopilotKit } from "@copilotkit/react-core";

export function LogiVNCopilotProvider({ children }: { children: ReactNode }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" showDevConsole={false} enableInspector={false}>
      {children}
    </CopilotKit>
  );
}
