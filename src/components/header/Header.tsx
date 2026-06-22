import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React from "react";
import "./Header.scss";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faBook } from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import { Dropdown, Nav, NavDropdown, Navbar } from "react-bootstrap";
import { Link, useLocation } from "react-router-dom";
import Page from "../../model/Page";

const logoUrl = new URL("../../assets/logo.svg", import.meta.url);

const Header = () => {
    const { t } = useTranslation();
    const location = useLocation();
    return (
        <Navbar
            expand="sm"
            bg="dark"
            data-bs-theme="dark"
            className="header"
            style={{ height: "60px" }}
        >
            <NavDropdown
                className="left"
                title={
                    <Navbar.Brand>
                        {(location.pathname.startsWith("/fluidnc") ||
                            location.pathname == "/") && (
                            <img
                                src={logoUrl.toString()}
                                alt="Dune Weaver logo"
                                width={150}
                            />
                        )}
                    </Navbar.Brand>
                }
            >
                <Dropdown.Item as={Link} to={Page.FLUIDNC_HOME}>
                    Home
                </Dropdown.Item>
            </NavDropdown>

            <Navbar.Toggle />

            <Navbar.Collapse className="justify-content-end">
                <Nav.Link
                    href="https://duneweaver.com"
                    target="_blank"
                    className="nav-link active"
                >
                    <FontAwesomeIcon icon={faBook as IconDefinition} />{" "}
                    {t("header.documentation")}
                </Nav.Link>
            </Navbar.Collapse>
        </Navbar>
    );
};
export default Header;
