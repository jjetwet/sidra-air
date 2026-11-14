import { useQuery } from "@tanstack/react-query";

import { Airport, api, Guest, Jet, Quote } from "@/src/api";

export const useFleet = () => useQuery({ queryKey: ["fleet"], queryFn: () => api<Jet[]>("/fleet"), staleTime: Infinity });

export const useAirports = () =>
  useQuery({ queryKey: ["airports"], queryFn: () => api<Airport[]>("/airports"), staleTime: Infinity });

export const useQuotes = () => useQuery({ queryKey: ["quotes"], queryFn: () => api<Quote[]>("/quotes") });

export const useTravellers = () => useQuery({ queryKey: ["travellers"], queryFn: () => api<Guest[]>("/travellers") });
