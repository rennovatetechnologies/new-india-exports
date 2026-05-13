"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { jwtDecode } from "jwt-decode";

/**
 * Guard component for Admin routes
 */
export default function AdminProtectedRoute({ children }) {
    const router = useRouter();
    const [authorized, setAuthorized] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAuth = () => {
            try {
                const token = localStorage.getItem("adminToken");

                if (!token) {
                    console.log("No token found, redirecting to login");
                    router.push("/admin/login");
                    return;
                }

                const decoded = jwtDecode(token);

                // Check if token is expired
                const currentTime = Date.now() / 1000;
                if (decoded.exp < currentTime) {
                    console.log("Token expired");
                    localStorage.removeItem("adminToken");
                    router.push("/admin/login");
                    return;
                }

                // Check for admin role
                if (decoded.role !== "admin") {
                    console.log("User is not an admin");
                    router.push("/unauthorized");
                    return;
                }

                setAuthorized(true);
            } catch (error) {
                console.error("Auth verification failed:", error);
                router.push("/admin/login");
            } finally {
                setLoading(false);
            }
        };

        checkAuth();
    }, [router]);

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return authorized ? children : null;
}
