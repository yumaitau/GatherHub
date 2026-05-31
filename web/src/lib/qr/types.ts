export type DotStyle =
  | "square"
  | "rounded"
  | "dots"
  | "classy"
  | "classy-rounded";
export type CornerSquareStyle = "square" | "rounded" | "dots";
export type LogoSize = "small" | "medium" | "large";

export interface QRSettings {
  fgColor: string;
  bgColor: string;
  size: number;
  dotStyle: DotStyle;
  cornerSquareStyle: CornerSquareStyle;
  margin: number;
  logoSize: LogoSize;
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
}

export interface QRMatrix {
  size: number;
  data: number[];
}

export const LOGO_SIZE_PERCENT: Record<LogoSize, number> = {
  small: 0.18,
  medium: 0.28,
  large: 0.36,
};

export const DEFAULT_QR_SETTINGS: QRSettings = {
  fgColor: "#000000",
  bgColor: "#ffffff",
  size: 300,
  dotStyle: "square",
  cornerSquareStyle: "square",
  margin: 2,
  logoSize: "medium",
  borderEnabled: false,
  borderColor: "#000000",
  borderWidth: 2,
  borderRadius: 8,
};
