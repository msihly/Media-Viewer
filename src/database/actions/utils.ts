import { LeanDocument, Types } from "mongoose";

export const leanModelToJson = <T>(doc: LeanDocument<T & { _id: Types.ObjectId }>) => {
  try {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { ...rest, id: _id.toString() } as unknown as T;
  } catch (err) {
    console.error(err.stack);
    return null;
  }
};