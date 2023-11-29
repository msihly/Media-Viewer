// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { colors as muiColors } from "@mui/material";
import { Theme, useTheme } from "@mui/material/styles";
import { createMakeAndWithStyles, CSSObject, Cx } from "tss-react";

export type Margins = {
  all?: CSSObject["margin"];
  top?: CSSObject["marginTop"];
  bottom?: CSSObject["marginBottom"];
  right?: CSSObject["marginRight"];
  left?: CSSObject["marginLeft"];
};

export type Padding = {
  all?: CSSObject["padding"];
  top?: CSSObject["paddingTop"];
  bottom?: CSSObject["paddingBottom"];
  right?: CSSObject["paddingRight"];
  left?: CSSObject["paddingLeft"];
};

type ClassName<T> = { [P in keyof T]: CSSObject };

const { makeStyles } = createMakeAndWithStyles({ useTheme });

export const makeClasses = <T extends ClassName<T>>(
  fnOrObj: ClassName<T> | ((theme: Theme, props: Record<string, any>) => ClassName<T>)
) => {
  return (params: CSSObject | Record<string, any>) => {
    const { classes: css, cx } = makeStyles<typeof params>()(fnOrObj)(params);
    return { css, cx } as { css: Record<keyof T, string>; cx: Cx };
  };
};

export const colors = {
  ...muiColors,
  button: {
    blue: muiColors.blue["800"],
    grey: muiColors.grey["300"],
    purple: muiColors.purple["700"],
    red: muiColors.red["900"],
  },
  error: muiColors.red["900"],
  primary: muiColors.blue["800"],
  success: muiColors.green["800"],
  text: {
    black: muiColors.grey["900"],
    blue: muiColors.blue["800"],
    grey: muiColors.grey["500"],
    red: muiColors.red["900"],
    white: muiColors.grey["100"],
  },
};
