"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

/** A password box with an eye to see what was typed (the password is shown while the eye is on, and hidden again by itself when the page changes). */
export function PasswordInput({ id, ...props }: Omit<React.ComponentProps<"input">, "type"> & { id: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={shown ? "text" : "password"} className="pr-10" {...props} />
      <button type="button" onClick={() => setShown((s) => !s)} aria-pressed={shown} aria-label={shown ? "Hide the password" : "Show the password"} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground">
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
