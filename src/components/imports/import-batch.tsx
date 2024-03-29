import path from "path";
import { useState } from "react";
import { observer } from "mobx-react-lite";
import { ImportBatch as ImportBatchType, useStores } from "store";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList } from "react-window";
import { LinearProgress } from "@mui/material";
import {
  BatchTooltip,
  Icon,
  IconButton,
  IMPORT_STATUSES,
  ImportStatus,
  Text,
  View,
} from "components";
import { IMPORT_CARD_SIZE, ImportCard } from ".";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";
import Color from "color";

interface ImportBatchProps {
  batch: ImportBatchType;
}

export const ImportBatch = observer(({ batch }: ImportBatchProps) => {
  const { fileCollectionStore, importStore, tagStore } = useStores();

  const index = importStore.batches.findIndex((b) => b.id === batch.id);
  const status = IMPORT_STATUSES[batch.status];

  const [expanded, setExpanded] = useState(false);

  const { css } = useClasses({ expanded, hasTags: batch.tagIds?.length > 0 });

  const handleCollections = () => {
    if (!fileCollectionStore.getById(batch.collectionId))
      return toast.error("Collection not found");
    fileCollectionStore.setActiveCollectionId(batch.collectionId);
    fileCollectionStore.setIsEditorOpen(true);
  };

  const handleDelete = async () => {
    const res = await importStore.deleteImportBatches({ ids: [batch.id] });
    if (!res.success) toast.error(`Error deleting import batch: ${res?.error}`);
    else toast.success("Import batch deleted");
  };

  const handleTag = () => {
    tagStore.setTaggerBatchId(batch.id);
    tagStore.setTaggerFileIds([...batch.completed.map((imp) => imp.fileId)]);
    tagStore.setIsTaggerOpen(true);
  };

  const toggleOpen = () => setExpanded(!expanded);

  return (
    <View column className={css.root}>
      <View row className={css.header}>
        <View onClick={toggleOpen} className={css.headerButton}>
          <View className={css.headerTop}>
            <Text className={css.folderPath}>
              {batch.imports[0]?.path && path.dirname(batch.imports[0].path)}
            </Text>

            <Icon name="ChevronRight" rotation={90} margins={{ right: "0.5rem" }} />
          </View>

          <View className={css.headerBottom}>
            <Text className={css.index}>{`${index + 1}.`}</Text>

            <BatchTooltip batch={batch}>
              <Icon name={status.icon} color={status.color} className={css.statusIcon} />
            </BatchTooltip>

            <View className={css.headerCenter}>
              <View row className={css.progressContainer}>
                <Text className={css.progressText}>
                  {`${batch.imported.length} / `}
                  <Text color={colors.grey["500"]}>{batch.imports.length}</Text>
                </Text>

                <LinearProgress
                  variant="determinate"
                  value={(batch.imported.length / batch.imports.length) * 100}
                  className={css.progressBar}
                />
              </View>
            </View>
          </View>
        </View>

        <View column>
          <View row justify="space-between">
            <IconButton
              name="Collections"
              onClick={handleCollections}
              disabled={!batch.collectionId}
              iconProps={{
                color: !batch.collectionId
                  ? Color(colors.grey["300"]).fade(0.5).string()
                  : colors.grey["300"],
                size: "0.9em",
              }}
            />

            <IconButton
              name="Label"
              onClick={handleTag}
              disabled={batch.status === "PENDING"}
              iconProps={{
                color:
                  batch.status === "PENDING"
                    ? Color(colors.grey["300"]).fade(0.5).string()
                    : colors.grey["300"],
                size: "0.9em",
              }}
            />
          </View>

          <View row justify="space-between">
            <View />

            <IconButton
              name="Delete"
              onClick={handleDelete}
              iconProps={{ color: colors.red["700"], size: "0.9em" }}
            />
          </View>
        </View>
      </View>

      {expanded && batch.imports?.length > 0 && (
        <View column spacing="0.3rem" className={css.importCards}>
          <ImportCardRow {...{ batch, status: "PENDING" }} />
          <ImportCardRow {...{ batch, status: "COMPLETE" }} />
          <ImportCardRow {...{ batch, status: "ERROR" }} />
          <ImportCardRow {...{ batch, status: "DUPLICATE" }} />
          <ImportCardRow {...{ batch, status: "DELETED" }} />
        </View>
      )}
    </View>
  );
});

const ImportCardRow = observer(
  ({ batch, status }: { batch: ImportBatchType; status: ImportStatus }) => {
    const { css } = useClasses({ expanded: true, hasTags: batch.tagIds?.length > 0 });

    const meta = IMPORT_STATUSES[status];
    const imports = batch.imports.filter((imp) => imp.status === status);

    return !imports?.length ? null : (
      <View column>
        <View row spacing="0.5rem" margins={{ left: "0.3rem" }}>
          <Icon name={meta.icon} color={meta.color} />
          <Text color={meta.color} fontWeight={500}>
            {meta.label}
          </Text>
          <Text color={colors.grey["700"]}>{` - ${imports.length}`}</Text>
        </View>

        <View className={css.importCardRow}>
          <AutoSizer disableHeight>
            {({ width }) => (
              <FixedSizeList
                {...{ width }}
                layout="horizontal"
                height={IMPORT_CARD_SIZE + 10}
                itemSize={IMPORT_CARD_SIZE}
                itemCount={imports.length}
              >
                {({ index, style }) => (
                  <ImportCard {...{ style }} key={index} fileImport={imports[index]} />
                )}
              </FixedSizeList>
            )}
          </AutoSizer>
        </View>
      </View>
    );
  }
);

const useClasses = makeClasses((_, { expanded, hasTags }) => ({
  folderPath: {
    color: colors.grey["300"],
    fontSize: "0.9em",
    textOverflow: "ellipsis",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  header: {
    borderRadius: expanded ? "0.4rem 0.4rem 0 0" : "0.4rem",
    backgroundColor: colors.grey["900"],
  },
  headerBottom: {
    display: "flex",
    flexDirection: "row",
    flexBasis: "50%",
  },
  headerButton: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflow: "hidden",
    "&:hover": { cursor: "pointer" },
  },
  headerCenter: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    width: 0,
  },
  headerTop: {
    display: "flex",
    flexDirection: "row",
    flexBasis: "50%",
    justifyContent: "space-between",
    borderTopLeftRadius: "0.4rem",
    padding: "0.3em 0.5em",
    backgroundColor: colors.darkGrey,
  },
  index: {
    justifyContent: "center",
    alignSelf: "center",
    paddingLeft: "0.5em",
    fontSize: "0.8em",
    textAlign: "center",
    textShadow: `0px 0px 5px ${colors.blue["700"]}`,
  },
  importCards: {
    borderRadius: "0 0 0.5rem 0.5rem",
    padding: "0.5rem",
    width: "-webkit-fill-available",
    backgroundColor: colors.grey["900"],
  },
  importCardRow: {
    display: "flex",
    flexDirection: "row",
    whiteSpace: "nowrap",
    overflowX: "auto",
  },
  progressBar: {
    flex: 1,
    margin: "0 0.5rem",
  },
  progressContainer: {
    flex: 1,
    alignItems: "center",
    width: "100%",
    margin: hasTags ? "0.2rem 0.3rem 0.4rem" : "0.3rem",
  },
  progressText: {
    fontSize: "0.9em",
    textAlign: "left",
  },
  root: {
    flex: "none",
    marginBottom: "0.5rem",
    width: "100%",
    overflow: "hidden",
  },
  statusIcon: {
    borderRadius: "0.5rem 0 0 0.5rem",
    padding: "0 0.5rem",
  },
}));
