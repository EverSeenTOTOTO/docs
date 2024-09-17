import React from "react";
import { VitePressData } from "vitepress";

export const ReactWrapContext = React.createContext<{ vpData?: VitePressData }>({});

