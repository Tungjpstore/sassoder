"use client";

import { useRef, useState } from "react";
import type { MouseEvent } from "react";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { ButtonProps } from "@/components/ui/button";

type ConfirmActionButtonProps = ButtonProps & {
  confirmTitle: string;
  confirmDescription: string;
  confirmLabel?: string;
  confirmationText?: string;
};

export function ConfirmActionButton({
  children,
  confirmDescription,
  confirmLabel = "Xác nhận",
  confirmationText,
  confirmTitle,
  onClick,
  ...buttonProps
}: ConfirmActionButtonProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const allowNextSubmitRef = useRef(false);
  const [open, setOpen] = useState(false);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (allowNextSubmitRef.current) {
      allowNextSubmitRef.current = false;
      onClick?.(event);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  }

  function confirmAction() {
    allowNextSubmitRef.current = true;
    setOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.click());
  }

  return (
    <>
      <Button ref={buttonRef} {...buttonProps} onClick={handleClick}>
        {children}
      </Button>
      <ConfirmDialog
        open={open}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        confirmationText={confirmationText}
        onCancel={() => setOpen(false)}
        onConfirm={confirmAction}
      />
    </>
  );
}
