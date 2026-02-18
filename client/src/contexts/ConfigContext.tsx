import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { supabase } from "../lib/supabase";
import type { AppConfig, BoardSize, ThemeConfig } from "../types";

const ConfigContext = createContext<{ config: AppConfig; loading: boolean } | undefined>(undefined);

const defaultConfig: AppConfig = {
  boardSizes: [
    { id: "4x4", label: "Recruit", rows: 4, cols: 4, sort_order: 1 },
    { id: "6x6", label: "Veteran", rows: 6, cols: 6, sort_order: 2 },
    { id: "8x8", label: "Elite", rows: 8, cols: 8, sort_order: 3 }
  ],
  themes: [{ id: "neon", name: "Neon", config_json: {} }]
};

export function ConfigProvider({ children }: PropsWithChildren) {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [boards, themes] = await Promise.all([
        supabase.from("board_sizes").select("id,label,rows,cols,sort_order").eq("is_active", true).order("sort_order"),
        supabase.from("themes").select("id,name,config_json").eq("is_active", true)
      ]);

      if (boards.data && themes.data) {
        setConfig({
          boardSizes: boards.data as BoardSize[],
          themes: themes.data as ThemeConfig[]
        });
      }

      setLoading(false);
    };

    void load();
  }, []);

  const value = useMemo(() => ({ config, loading }), [config, loading]);
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error("useConfig must be used inside ConfigProvider");
  }
  return ctx;
}
