import { ipcRenderer } from "electron";
import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { File, useStores } from "store";
import { colors, Chip, Paper, Tooltip } from "@mui/material";
import { Icon, Tag, Text, View } from "components";
import { ContextMenu, FileTooltip } from ".";
import { centeredSlice, dayjs, formatBytes, makeClasses } from "utils";
import Color from "color";

interface FileCardProps {
  file?: File;
  id?: string;
}

export const FileCard = observer(({ file, id }: FileCardProps) => {
  const { fileStore, homeStore, tagStore } = useStores();
  if (!file) file = fileStore.getById(id);

  const { css } = useClasses({ selected: file.isSelected });

  const thumbInterval = useRef(null);
  const [thumbIndex, setThumbIndex] = useState(0);

  const handleMouseEnter = () => {
    thumbInterval.current = setInterval(() => {
      setThumbIndex((thumbIndex) =>
        thumbIndex + 1 === file.thumbPaths.length ? 0 : thumbIndex + 1
      );
    }, 300);
  };

  const handleMouseLeave = () => {
    clearInterval(thumbInterval.current);
    thumbInterval.current = null;
    setThumbIndex(0);
  };

  const handleTagPress = (tagId: string) => {
    tagStore.setActiveTagId(tagId);
    tagStore.setTagManagerMode("edit");
    tagStore.setIsTagManagerOpen(true);
  };

  const openFile = () => {
    ipcRenderer.send("createCarouselWindow", {
      fileId: file.id,
      height: file.height,
      selectedFileIds: centeredSlice(
        homeStore.filteredFiles,
        homeStore.filteredFiles.findIndex((f) => f.id === file.id),
        500
      ).map((f) => f.id),
      width: file.width,
    });
  };

  return (
    <ContextMenu key="context-menu" file={file} className={`${css.container} selectable`}>
      <Paper onDoubleClick={openFile} elevation={3} className={css.paper}>
        <View
          onMouseEnter={file.isAnimated ? handleMouseEnter : null}
          onMouseLeave={file.isAnimated ? handleMouseLeave : null}
          className={css.imageContainer}
        >
          <Chip
            icon={<Icon name="Star" color={colors.amber["600"]} size="inherit" />}
            label={file.rating}
            className={css.rating}
          />

          <img
            src={file.thumbPaths[thumbIndex]}
            className={css.image}
            alt={file.originalName}
            draggable={false}
            loading="lazy"
          />

          <Chip label={file.ext} className={css.ext} />

          {file.collections.length > 0 && (
            <Chip
              icon={<Icon name="Collections" size="inherit" margins={{ left: "0.5rem" }} />}
              label={file.collections.length}
              // className={css.collections}
            />
          )}

          {file.duration && (
            <Chip
              label={dayjs.duration(file.duration, "s").format("HH:mm:ss")}
              className={css.duration}
            />
          )}
        </View>

        <View row className={css.footer}>
          <View row className={css.tags}>
            {file.tags.slice(0, 5).map((tag) => (
              <Tag key={tag.id} tag={tag} onClick={() => handleTagPress(tag.id)} size="small" />
            ))}
          </View>

          <FileTooltip file={file} onTagPress={handleTagPress} />
        </View>
      </Paper>
    </ContextMenu>
  );
});

const useClasses = makeClasses((theme, { selected }) => ({
  container: {
    flexBasis: "calc(100% / 7)",
    [theme.breakpoints.down("xl")]: { flexBasis: "calc(100% / 5)" },
    [theme.breakpoints.down("lg")]: { flexBasis: "calc(100% / 4)" },
    [theme.breakpoints.down("md")]: { flexBasis: "calc(100% / 3)" },
    border: "1px solid",
    borderColor: "#0f0f0f",
    borderRadius: 4,
    padding: "0.25rem",
    height: "fit-content",
    background: selected
      ? `linear-gradient(to bottom right, ${colors.blue["800"]}, ${Color(colors.blue["900"])
          .fade(0.5)
          .string()} 60%)`
      : "transparent",
    overflow: "hidden",
    cursor: "pointer",
    userSelect: "none",
  },
  duration: {
    position: "absolute",
    bottom: "0.5rem",
    right: "0.5rem",
    backgroundColor: colors.grey["900"],
    opacity: 0.5,
    cursor: "pointer",
    transition: "all 200ms ease-in-out",
    "&:hover": {
      opacity: 0.8,
    },
  },
  ext: {
    position: "absolute",
    top: "0.5rem",
    right: "0.5rem",
    backgroundColor: colors.grey["900"],
    opacity: 0.5,
    cursor: "pointer",
    transition: "all 200ms ease-in-out",
    "&:hover": {
      opacity: 0.8,
    },
  },
  footer: {
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomLeftRadius: "inherit",
    borderBottomRightRadius: "inherit",
    padding: "0.2em 0.3em",
    height: "1.8rem",
    backgroundColor: "inherit",
  },
  image: {
    width: "100%",
    minHeight: "9rem",
    objectFit: "cover",
    borderTopLeftRadius: "inherit",
    borderTopRightRadius: "inherit",
    userSelect: "none",
  },
  imageContainer: {
    position: "relative",
    borderTopLeftRadius: "inherit",
    borderTopRightRadius: "inherit",
    backgroundColor: "inherit",
  },
  paper: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    height: "auto",
    backgroundColor: colors.grey["900"],
    userSelect: "none",
  },
  rating: {
    position: "absolute",
    top: "0.5rem",
    left: "0.5rem",
    backgroundColor: colors.grey["900"],
    opacity: 0.7,
    cursor: "pointer",
    transition: "all 200ms ease-in-out",
    "&:hover": {
      opacity: 0.85,
    },
  },
  tags: {
    position: "relative",
    overflow: "hidden",
    "&::after": {
      content: '""',
      position: "absolute",
      top: 0,
      bottom: 0,
      right: 0,
      left: 0,
      background: `linear-gradient(to right, transparent 60%, ${colors.grey["900"]})`,
    },
  },
  tooltip: {
    backgroundColor: colors.grey["900"],
    boxShadow: "rgb(0 0 0 / 50%) 1px 2px 4px 0px",
  },
}));
