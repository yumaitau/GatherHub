import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, type InputProps } from "@/components/ui/input";
import { useGatherHub } from "@/lib/gatherhub";
import {
  createAutocompleteSessionToken,
  fetchAddressSuggestions,
  GoogleAddressLookupError,
  isGoogleMapsConfigured,
} from "@/lib/googleMaps";
import { cn } from "@/lib/utils";

type AddressAutocompleteInputProps = Omit<InputProps, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  defaultAddress?: string | null;
  showDefaultAction?: boolean;
  showLookupHint?: boolean;
};

type AddressSuggestion = {
  id: string;
  label: string;
  mainText: string;
  secondaryText?: string;
};

export function AddressAutocompleteInput({
  value,
  onChange,
  defaultAddress,
  showDefaultAction = true,
  showLookupHint = false,
  disabled,
  className,
  placeholder = "Start typing an address",
  ...props
}: AddressAutocompleteInputProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const onChangeRef = React.useRef(onChange);
  const blurTimerRef = React.useRef<number | undefined>(undefined);
  const sessionTokenRef = React.useRef<unknown>(undefined);
  const requestIdRef = React.useRef(0);
  const [suggestions, setSuggestions] = React.useState<AddressSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const configured = isGoogleMapsConfigured();
  const cleanDefault = defaultAddress?.trim();
  const listboxId = React.useId();

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    let active = true;
    const query = value.trim();

    if (!configured || disabled || query.length < 3) {
      setSearching(false);
      setSuggestions([]);
      setOpen(false);
      setLookupError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setLookupError(null);
      try {
        sessionTokenRef.current ??= await createAutocompleteSessionToken();
        const next = await fetchAddressSuggestions(
          query,
          sessionTokenRef.current,
        );
        if (active && requestId === requestIdRef.current) {
          setSuggestions(next);
          setOpen(
            document.activeElement === inputRef.current && next.length > 0,
          );
        }
      } catch (error) {
        if (active && requestId === requestIdRef.current) {
          setSuggestions([]);
          setOpen(false);
          setLookupError(
            error instanceof GoogleAddressLookupError
              ? error.message
              : "Google address lookup is unavailable. You can still type a location.",
          );
        }
      } finally {
        if (active && requestId === requestIdRef.current) {
          setSearching(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [configured, disabled, value]);

  React.useEffect(() => {
    return () => {
      if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
    };
  }, []);

  function selectSuggestion(suggestion: AddressSuggestion) {
    onChangeRef.current(suggestion.label);
    setSuggestions([]);
    setOpen(false);
    sessionTokenRef.current = undefined;
  }

  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
            if (suggestions.length > 0) setOpen(true);
          }}
          onBlur={() => {
            blurTimerRef.current = window.setTimeout(() => setOpen(false), 120);
          }}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={open ? listboxId : undefined}
          className={cn("pr-2", className)}
          {...props}
        />
        {open && suggestions.length > 0 && (
          <div
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-[10000] overflow-hidden rounded-md border border-hairline bg-surface-raised shadow-popover"
          >
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                role="option"
                className="block w-full border-t border-hairline px-2.5 py-2 text-left first:border-t-0 hover:bg-surface-sunk focus:bg-surface-sunk focus:outline-none"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(suggestion)}
              >
                <span className="block text-sm text-ink-strong">
                  {suggestion.mainText}
                </span>
                {suggestion.secondaryText && (
                  <span className="block text-caption text-ink-quiet">
                    {suggestion.secondaryText}
                  </span>
                )}
              </button>
            ))}
            <div className="border-t border-hairline px-2.5 py-1.5 text-caption text-ink-quiet">
              Powered by Google
            </div>
          </div>
        )}
      </div>
      {(cleanDefault || showLookupHint || lookupError) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {showDefaultAction &&
            cleanDefault &&
            value.trim() !== cleanDefault && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto text-caption"
                onClick={() => onChange(cleanDefault)}
                disabled={disabled}
              >
                Use organisation address
              </Button>
            )}
          {showLookupHint && configured && !lookupError && (
            <span className="text-caption text-ink-quiet">
              {searching
                ? "Searching Google addresses…"
                : "Google address lookup enabled."}
            </span>
          )}
          {lookupError && (
            <span className="text-caption text-warning">{lookupError}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function LocationInput(props: AddressAutocompleteInputProps) {
  const { org } = useGatherHub();
  return (
    <AddressAutocompleteInput
      {...props}
      defaultAddress={props.defaultAddress ?? org?.defaultAddress}
    />
  );
}
