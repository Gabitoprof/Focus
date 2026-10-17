"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";

/**
 * O cronômetro depende do relógio e do armazenamento do navegador, então é renderizado
 * apenas no cliente (evita divergência de hidratação).
 */
export const TimerClient = dynamic(() => import("./timer").then((m) => m.Timer), {
  ssr: false,
  loading: () => <Skeleton className="h-[480px]" />,
});
