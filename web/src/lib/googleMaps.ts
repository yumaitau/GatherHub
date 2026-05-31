type GoogleFormattableText = {
  text?: string;
};

type GooglePlacePrediction = {
  place?: string;
  placeId?: string;
  text?: GoogleFormattableText | string;
  structuredFormat?: {
    mainText?: GoogleFormattableText | string;
    secondaryText?: GoogleFormattableText | string;
  };
  mainText?: GoogleFormattableText;
  secondaryText?: GoogleFormattableText;
};

type GoogleAutocompleteSuggestion = {
  placePrediction?: GooglePlacePrediction;
};

type GoogleAutocompleteRequest = {
  input: string;
  includedRegionCodes?: string[];
  language?: string;
  region?: string;
  sessionToken?: unknown;
};

type GooglePlacesLibrary = {
  AutocompleteSessionToken: new () => unknown;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (
      request: GoogleAutocompleteRequest,
    ) => Promise<{ suggestions: GoogleAutocompleteSuggestion[] }>;
  };
};

type GoogleMapsNamespace = {
  maps: {
    importLibrary?: (libraryName: "places") => Promise<GooglePlacesLibrary>;
    places?: GooglePlacesLibrary;
  };
};

declare global {
  interface Window {
    google?: GoogleMapsNamespace;
    __gatherHubGoogleMapsLoaded?: () => void;
  }
}

let loadPromise: Promise<GoogleMapsNamespace> | undefined;
let scriptPromise: Promise<void> | undefined;

export class GoogleAddressLookupError extends Error {
  constructor(
    message: string,
    readonly code:
      | "missing_key"
      | "service_disabled"
      | "permission_denied"
      | "unavailable",
  ) {
    super(message);
    this.name = "GoogleAddressLookupError";
  }
}

export function googleMapsApiKey(): string {
  return (
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ??
    import.meta.env.VITE_GOOGLE_MAPS_KEY ??
    ""
  ).trim();
}

export function isGoogleMapsConfigured(): boolean {
  return googleMapsApiKey().length > 0;
}

export function loadGooglePlaces(): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in a browser."));
  }

  const key = googleMapsApiKey();
  if (!key) {
    return Promise.reject(
      new GoogleAddressLookupError(
        "Google Maps API key is not configured.",
        "missing_key",
      ),
    );
  }

  if (loadPromise) return loadPromise;

  loadPromise = loadPlacesLibrary(key);

  return loadPromise;
}

export async function fetchAddressSuggestions(
  input: string,
  sessionToken: unknown,
): Promise<
  Array<{ id: string; label: string; mainText: string; secondaryText?: string }>
> {
  const query = input.trim();
  if (query.length < 3) return [];

  const google = await loadGooglePlaces();
  const places = google.maps.places;
  if (!places?.AutocompleteSuggestion) {
    throw new Error("Google Places autocomplete is unavailable.");
  }

  const { suggestions } =
    await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      includedRegionCodes: ["au"],
      language: "en-AU",
      region: "au",
      sessionToken,
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/SERVICE_DISABLED|has not been used|disabled/i.test(message)) {
        throw new GoogleAddressLookupError(
          "Enable Places API (New) in Google Cloud for this API key.",
          "service_disabled",
        );
      }
      if (
        /PERMISSION_DENIED|403|RefererNotAllowed|ApiTargetBlocked/i.test(
          message,
        )
      ) {
        throw new GoogleAddressLookupError(
          "Google rejected this key for Places autocomplete. Check API restrictions and allowed websites.",
          "permission_denied",
        );
      }
      throw new GoogleAddressLookupError(
        "Google address lookup is unavailable. You can still type a location.",
        "unavailable",
      );
    });

  return suggestions.flatMap((suggestion) => {
    const prediction = suggestion.placePrediction;
    if (!prediction) return [];
    const label = textValue(prediction.text);
    if (!label) return [];
    return {
      id: prediction.placeId ?? prediction.place ?? label,
      label,
      mainText:
        textValue(prediction.mainText) ??
        textValue(prediction.structuredFormat?.mainText) ??
        label,
      secondaryText:
        textValue(prediction.secondaryText) ??
        textValue(prediction.structuredFormat?.secondaryText),
    };
  });
}

function textValue(
  value: GoogleFormattableText | string | undefined,
): string | undefined {
  if (typeof value === "string") return value;
  const text = value?.text;
  return text && text.trim() ? text : undefined;
}

export async function createAutocompleteSessionToken(): Promise<unknown> {
  const google = await loadGooglePlaces();
  const Token = google.maps.places?.AutocompleteSessionToken;
  return Token ? new Token() : undefined;
}

async function loadPlacesLibrary(key: string): Promise<GoogleMapsNamespace> {
  if (window.google?.maps?.places?.AutocompleteSuggestion) {
    return window.google;
  }

  await loadGoogleMapsScript(key);
  const places = await window.google?.maps.importLibrary?.("places");
  if (places?.AutocompleteSuggestion && window.google) {
    return window.google;
  }

  throw new Error("Google Places did not initialise.");
}

function loadGoogleMapsScript(key: string): Promise<void> {
  if (window.google?.maps.importLibrary) {
    return Promise.resolve();
  }
  if (scriptPromise) return scriptPromise;

  document.getElementById("google-maps-places-sdk")?.remove();

  scriptPromise = new Promise((resolve, reject) => {
    window.google = window.google ?? { maps: {} };
    window.__gatherHubGoogleMapsLoaded = () => {
      resolve();
      delete window.__gatherHubGoogleMapsLoaded;
    };

    const params = new URLSearchParams({
      key,
      v: "weekly",
      loading: "async",
      callback: "__gatherHubGoogleMapsLoaded",
    });

    const script = document.createElement("script");
    script.id = "google-maps-places-sdk";
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.onerror = () => {
      reject(new Error("Google Maps failed to load."));
      delete window.__gatherHubGoogleMapsLoaded;
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}
