import { FilterQuery } from "mongoose";
import * as db from "database";
import { dayjs, handleErrors, socket } from "utils";
import { leanModelToJson, objectIds } from "./utils";

/* ---------------------------- HELPER FUNCTIONS ---------------------------- */
const createCollectionFilterPipeline = ({
  excludedDescTagIds,
  excludedTagIds,
  isSortDesc,
  optionalTagIds,
  requiredDescTagIds,
  requiredTagIds,
  sortKey,
  title,
}: db.CreateCollectionFilterPipelineInput) => {
  const sortDir = isSortDesc ? -1 : 1;

  const hasExcludedTags = excludedTagIds?.length > 0;
  const hasOptionalTags = optionalTagIds?.length > 0;
  const hasRequiredTags = requiredTagIds.length > 0;

  return {
    $match: {
      ...(title ? { title: { $regex: new RegExp(title, "i") } } : {}),
      ...(hasExcludedTags || hasOptionalTags || hasRequiredTags
        ? {
            tagIds: {
              ...(hasExcludedTags ? { $nin: objectIds(excludedTagIds) } : {}),
              ...(hasOptionalTags ? { $in: objectIds(optionalTagIds) } : {}),
              ...(hasRequiredTags ? { $all: objectIds(requiredTagIds) } : {}),
            },
          }
        : {}),
      ...(excludedDescTagIds?.length > 0
        ? { tagIdsWithAncestors: { $nin: objectIds(excludedDescTagIds) } }
        : {}),
      ...(requiredDescTagIds?.length > 0
        ? { tagIdsWithAncestors: { $in: objectIds(requiredDescTagIds) } }
        : {}),
    },
    $sort: { [sortKey]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

const makeCollAttrs = async (files: db.File[]) => {
  const tagIds = [...new Set(files.flatMap((f) => f.tagIds))];
  return {
    fileCount: files.length,
    rating: files.reduce((acc, f) => acc + f.rating, 0) / files.length,
    tagIds,
    tagIdsWithAncestors: await db.deriveTagIdsWithAncestors(tagIds),
    thumbPaths: files.slice(0, 10).map((f) => f.thumbPaths[0]),
  };
};

export const regenCollTagAncestors = async (tagIdsFilter: FilterQuery<db.FileCollection>) =>
  handleErrors(async () => {
    const collections = (
      await db.FileCollectionModel.find(tagIdsFilter).select({ _id: 1, tagIds: 1 }).lean()
    ).map((r) => leanModelToJson<db.FileCollection>(r));

    await Promise.all(
      collections.map(async (collection) => {
        const tagIdsWithAncestors = await db.deriveTagIdsWithAncestors(collection.tagIds);
        await db.FileCollectionModel.updateOne(
          { _id: collection.id },
          { $set: { tagIdsWithAncestors, dateModified: dayjs().toISOString() } }
        );
      })
    );
  });

/* ------------------------------ API ENDPOINTS ----------------------------- */
export const createCollection = ({ fileIdIndexes, title, withSub }: db.CreateCollectionInput) =>
  handleErrors(async () => {
    const filesRes = await db.listFiles({ ids: fileIdIndexes.map((f) => f.fileId) });
    if (!filesRes.success) throw new Error(filesRes.error);

    const dateCreated = dayjs().toISOString();
    const collection = {
      ...(await makeCollAttrs(filesRes.data)),
      dateCreated,
      dateModified: dateCreated,
      fileIdIndexes,
      title,
    };

    const res = await db.FileCollectionModel.create(collection);
    if (withSub) socket.emit("collectionCreated", { collection: res });
    return { ...collection, id: res._id.toString() };
  });

export const deleteCollection = ({ id }: db.DeleteCollectionInput) =>
  handleErrors(async () => await db.FileCollectionModel.deleteOne({ _id: id }));

export const listFilteredCollections = ({
  page,
  pageSize,
  ...filterParams
}: db.ListFilteredCollectionsInput) =>
  handleErrors(async () => {
    const filterPipeline = createCollectionFilterPipeline(filterParams);

    const [collections, totalDocuments] = await Promise.all([
      db.FileCollectionModel.find(filterPipeline.$match)
        .sort(filterPipeline.$sort)
        .skip(Math.max(0, page - 1) * pageSize)
        .limit(pageSize)
        .allowDiskUse(true)
        .lean(),
      db.FileCollectionModel.countDocuments(filterPipeline.$match),
    ]);

    if (!collections || !(totalDocuments > -1))
      throw new Error("Failed to load filtered collection IDs");

    return {
      collections: collections.map((c) => leanModelToJson<db.FileCollection>(c)),
      pageCount: Math.ceil(totalDocuments / pageSize),
    };
  });

export const updateCollection = (updates: db.UpdateCollectionInput) =>
  handleErrors(async () => {
    updates.dateModified = dayjs().toISOString();

    if (updates.fileIdIndexes) {
      const filesRes = await db.listFiles({ ids: updates.fileIdIndexes.map((f) => f.fileId) });
      if (!filesRes.success) throw new Error(filesRes.error);
      updates = { ...updates, ...(await makeCollAttrs(filesRes.data)) };
    }

    return await db.FileCollectionModel.updateOne({ _id: updates.id }, updates);
  });
