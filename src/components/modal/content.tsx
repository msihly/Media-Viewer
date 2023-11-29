import { ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { DialogContent } from "@mui/material";
import { Padding, makeClasses } from "utils";

const DEFAULT_PADDING: Padding = { all: "0.5rem 1rem" };

interface ContentProps {
  children: ReactNode | ReactNode[];
  className?: string;
  dividers?: boolean;
  padding?: Padding;
}

export const Content = ({ children, className, dividers = true, padding }: ContentProps) => {
  padding = { ...DEFAULT_PADDING, ...padding };

  const { cx, css } = useClasses({ padding });

  return (
    <DialogContent {...{ dividers }} className={cx(css.content, className)}>
      {children}
    </DialogContent>
  );
};

const useClasses = makeClasses((_, { padding }) => ({
  content: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    padding,
  },
}));
