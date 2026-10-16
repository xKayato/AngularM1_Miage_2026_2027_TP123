import mongoose from "mongoose";
import { Post } from "../src/models/Post.js";
import { User } from "../src/models/User.js";
import { Like } from "../src/models/Like.js";
import { Comment } from "../src/models/Comment.js";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const pWithAtt = await Post.countDocuments({ seedBatch: "makershare-demo-v1", "attachments.0": { $exists: true } });
  const uWithAvatar = await User.countDocuments({ seedBatch: "makershare-demo-v1", "avatar.storedName": { $ne: null } });
  const likes = await Like.countDocuments();
  const comments = await Comment.countDocuments();
  console.log(JSON.stringify({
    postsWithAttachments: pWithAtt,
    usersWithAvatar: uWithAvatar,
    totalLikes: likes,
    totalComments: comments
  }, null, 2));
  await mongoose.disconnect();
}
main().catch(console.error);
