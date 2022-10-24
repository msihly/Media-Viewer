import { ReactNode } from "react";
import { Button, Icon, View } from "components";
import { Accordion as MuiAccordion, AccordionProps as MuiAccordionProps } from "@mui/material";
import { makeClasses } from "utils";

interface AccordionProps extends MuiAccordionProps {
  children: ReactNode | ReactNode[];
  color?: string;
  expanded: boolean;
  fullWidth?: boolean;
  header: ReactNode;
  setExpanded: (expanded: boolean) => void;
}

export const Accordion = ({
  children,
  className,
  color = "transparent",
  expanded,
  fullWidth = false,
  header,
  setExpanded,
}: AccordionProps) => {
  const { css, cx } = useClasses({ expanded, fullWidth });

  return (
    <MuiAccordion
      {...{ expanded }}
      TransitionProps={{ unmountOnExit: true }}
      disableGutters
      className={cx(css.accordion, className)}
    >
      <Button
        onClick={() => setExpanded(!expanded)}
        endNode={<Icon name="ExpandMore" rotation={expanded ? 180 : 0} />}
        color={color}
        fullWidth
        className={css.button}
      >
        {header}
      </Button>

      <View column>{children}</View>
    </MuiAccordion>
  );
};

const useClasses = makeClasses((_, { fullWidth }) => ({
  accordion: {
    margin: 0,
    padding: 0,
    width: fullWidth ? "100%" : "auto",
    background: "transparent",
    boxShadow: "none",
    "& button": {
      boxShadow: "none",
    },
    "&:before": {
      display: "none",
    },
  },
  button: {
    justifyContent: "space-between",
    padding: "0.5em 1em",
    fontSize: "1em",
    textTransform: "capitalize",
  },
}));
