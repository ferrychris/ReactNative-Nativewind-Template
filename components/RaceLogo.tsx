import Svg, { Line, Rect } from "react-native-svg";

type Props = { size?: number; framed?: boolean; tick?: boolean };

/** Heatlap mark: a white track oval with an orange start/finish tick. Same artwork as assets/images/logo.svg. */
export function RaceLogo({ size = 116, framed = true, tick = true }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" fill="none" accessibilityLabel="Heatlap">
      {framed && <Rect width={512} height={512} rx={96} fill="#0b0b0d" />}
      <Rect x={96} y={160} width={320} height={192} rx={96} stroke="#ffffff" strokeWidth={36} />
      {tick && <Line x1={256} y1={126} x2={256} y2={190} stroke="#e8582f" strokeWidth={30} strokeLinecap="round" />}
    </Svg>
  );
}
