import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faGithubSquare } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React from "react";
import { Card } from "react-bootstrap";
import { useTranslation } from "react-i18next";

const DonateCard = () => {
    const { t } = useTranslation();

    return (
        <Card style={{ backgroundColor: "#f0f0f0" }}>
            <Card.Body>
                <p className="small">{t("card.donate.description")}</p>

                <div className="d-flex justify-content-center">
                    <a
                        href="https://github.com/sponsors/tuanchris"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <FontAwesomeIcon
                            icon={faGithubSquare as IconDefinition}
                            size="3x"
                            style={{ color: "black" }}
                        />
                    </a>
                </div>
            </Card.Body>
        </Card>
    );
};

export default DonateCard;
