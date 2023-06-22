import { shell } from "@electron/remote";
import { ReactNode, useState } from "react";
import { observer } from "mobx-react-lite";
import { File, useStores } from "store";
import { Menu } from "@mui/material";
import { ListItem, View, ViewProps } from "components";
import { InfoModal } from ".";

interface ContextMenuProps extends ViewProps {
  children?: ReactNode | ReactNode[];
  file: File;
}

export const ContextMenu = observer(({ children, file, ...props }: ContextMenuProps) => {
  const rootStore = useStores();
  const { fileCollectionStore, fileStore } = useStores();

  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [mouseX, setMouseX] = useState(null);
  const [mouseY, setMouseY] = useState(null);

  const handleContext = (event) => {
    event.preventDefault();
    setMouseX(event.clientX - 2);
    setMouseY(event.clientY - 4);
  };

  const handleClose = () => {
    setMouseX(null);
    setMouseY(null);
  };

  const handleCollections = () => {
    fileCollectionStore.setActiveFileId(file.id);
    fileCollectionStore.setIsCollectionManagerOpen(true);
    handleClose();
  };

  const handleDelete = () => {
    fileStore.deleteFiles({
      rootStore,
      files: fileStore.getIsSelected(file.id) ? fileStore.selected : [file],
    });
    handleClose();
  };

  const openInfo = () => {
    setIsInfoOpen(true);
    handleClose();
  };

  const openInExplorer = () => {
    shell.showItemInFolder(file.path);
    handleClose();
  };

  const openNatively = () => {
    shell.openPath(file.path);
    handleClose();
  };

  const listItemProps = {
    iconMargin: "0.5rem",
    paddingLeft: "0.2em",
    paddingRight: "0.5em",
  };

  return (
    <View {...props} id={file.id} onContextMenu={handleContext}>
      {children}

      <Menu
        open={mouseY !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          mouseX !== null && mouseY !== null ? { top: mouseY, left: mouseX } : undefined
        }
      >
        <ListItem
          text="Open Natively"
          icon="DesktopWindows"
          onClick={openNatively}
          {...listItemProps}
        />

        <ListItem
          text="Open in Explorer"
          icon="Search"
          onClick={openInExplorer}
          {...listItemProps}
        />

        <ListItem text="Info" icon="Info" onClick={openInfo} {...listItemProps} />

        <ListItem
          text="Collections"
          icon="Collections"
          onClick={handleCollections}
          {...listItemProps}
        />

        <ListItem
          text={file?.isArchived ? "Delete" : "Archive"}
          icon={file?.isArchived ? "Delete" : "Archive"}
          onClick={handleDelete}
          {...listItemProps}
        />
      </Menu>

      {isInfoOpen && <InfoModal fileId={file.id} setVisible={setIsInfoOpen} />}
    </View>
  );
});
