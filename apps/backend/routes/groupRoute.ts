import express, { Request, Response } from "express";
import { prisma } from "@repo/db";

export const groupRoute = express.Router();

groupRoute.post("/creategroup", async (req: Request, res: Response) => {
  const { groupId, name } = req.body;
  console.log("groupId, name", groupId);
  try {
    if (!groupId || !name) {
      return res
        .status(400)
        .json({ message: "groupId, name, and telegramId are required" });
    }
    const existingGroup = await prisma.group.findUnique({
      where: { groupId },
    });

    if (existingGroup) {
      return res.status(409).json({ message: "Group already exists" });
    }
    const response = await prisma.group.create({
      data: {
        groupId,
        name,
      },
      include: { members: true },
    });

    console.log("✅ Group created with first member:", response);
    return res.status(200).json({
      message: "Group created successfully",
      group: response,
    });
  } catch (error: unknown) {
    console.error("❌ Error creating group:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

groupRoute.post("/addMember", async (req: Request, res: Response) => {
  const { groupId, telegramId } = req.body;

  if (!groupId || !telegramId) {
    return res.status(400).json({
      message: "groupId and telegramId are required",
    });
  }

  try {
    const group = await prisma.group.findUnique({
      where: { groupId },
      include: { members: true },
    });

    if (!group) {
      console.log('we cannnot find the group');
      return res.status(404).json({ message: "Group not found" });
    }
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const updatedGroup = await prisma.group.update({
      where: { groupId },
      data: {
        members: {
          connect: { telegramId },
        },
      },
      include: { members: true },
    });

    return res.status(200).json({
      message: "User added to group successfully",
      group: updatedGroup,
    });
  } catch (error) {
    console.error("Error adding member:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

groupRoute.post("/removeMember", async (req: Request, res: Response) => {
  console.log("inside the remove member");
  const { telegramId, groupId } = req.body;

  if (!telegramId || !groupId) {
    return res.status(400).json({
      message: "telegramId and groupId are required",
    });
  }

  try {
    const group = await prisma.group.findUnique({
      where: { groupId },
      include: { members: true },
    });

    if (!group) {
      console.log("we cannot find the group");
      return res.status(404).json({ message: "Group not found" });
    }
    const isMember = group.members.some(
      (member) => member.telegramId === telegramId
    );

    if (!isMember) {
      return res
        .status(404)
        .json({ message: "User is not a member of this group" });
    }
    const updatedGroup = await prisma.group.update({
      where: { groupId },
      data: {
        members: {
          disconnect: { telegramId },
        },
      },
      include: { members: true },
    });

    return res.status(200).json({
      message: "User removed from group successfully",
      group: updatedGroup,
    });
  } catch (error) {
    console.error("Error removing member:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

groupRoute.get("/getGroupDetails/:groupId", async (req: Request, res: Response) => {
  const { groupId } = req.params;
  try {
    const group = await prisma.group.findUnique({
      where: { groupId },
      include: { members: true },
    });
    if (!group) return res.status(404).json({ message: "Group not found" });
    return res.json(group);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default groupRoute;
