import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// List active auctions
router.get("/auctions", async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = 20;

        const listings = await prisma.auctionListing.findMany({
            skip: (page - 1) * limit,
            take: limit,
            include: {
                item: true,
                seller: {
                    select: { username: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ listings, page });
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch auctions" });
    }
});

// Create auction listing
router.post("/auctions", async (req, res) => {
    // Requires Authentication (simplified for prototype)
    const { sellerId, itemId, price } = req.body;

    try {
        // Verify ownership and unlisted status
        const item = await prisma.item.findUnique({ where: { id: itemId } });
        if (!item || item.ownerId !== sellerId) {
            return res.status(403).json({ error: "Invalid item or ownership" });
        }

        const listing = await prisma.auctionListing.create({
            data: {
                itemId,
                sellerId,
                price
            }
        });

        res.json({ success: true, listing });
    } catch (e) {
        res.status(500).json({ error: "Failed to create listing" });
    }
});

// Buy an item
router.post("/auctions/:id/buy", async (req, res) => {
    const listingId = req.params.id;
    const { buyerId } = req.body;

    try {
        // Transactional buy
        const result = await prisma.$transaction(async (tx: any) => {
            const listing = await tx.auctionListing.findUnique({
                where: { id: listingId },
                include: { item: true }
            });

            if (!listing) {
                throw new Error("Listing not found");
            }

            const buyer = await tx.user.findUnique({ where: { id: buyerId } });
            if (!buyer || buyer.gold < listing.price) {
                throw new Error("Insufficient funds");
            }

            // Deduct gold
            await tx.user.update({
                where: { id: buyerId },
                data: { gold: buyer.gold - listing.price }
            });

            // Add gold to seller (minus 5% fee)
            const fee = Math.floor(listing.price * 0.05);
            const sellerProceeds = listing.price - fee;

            await tx.user.update({
                where: { id: listing.sellerId },
                data: { gold: { increment: sellerProceeds } }
            });

            // Transfer item
            await tx.item.update({
                where: { id: listing.itemId },
                data: { ownerId: buyerId }
            });

            // Delete listing
            await tx.auctionListing.delete({ where: { id: listingId } });

            return { success: true, itemId: listing.itemId };
        });

        res.json(result);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

export default router;
